// Use Electron's Node runtime for the installed better-sqlite3 ABI.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import { test } from 'node:test';
import {
  availableMusicTracks,
  createMusicAvailabilityCheck
} from '../src/main/musicAvailability.js';
import { loadCatalogPlaylist, parsePlaylist } from '../src/main/playlistCatalog.js';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'music-availability-'));
const online = path.join(root, 'online');
const offline = path.join(root, 'offline');
await fs.mkdir(online);
await fs.mkdir(offline);
const track = (id, folder = online, ext = 'mp3') => ({
  track_id: id,
  audiotrack: path.join(folder, `${id}.${ext}`).replaceAll('\\', '/'),
  title: id
});
const a = track('a'),
  b = track('b', online, 'flac'),
  c = track('c'),
  d = track('d', offline);
await fs.writeFile(a.audiotrack, 'fixture mp3');
await fs.writeFile(b.audiotrack, 'fixture flac');
await fs.writeFile(d.audiotrack, 'fixture offline');
await fs.rename(offline, offline + '-disconnected');
const filename = path.join(root, 'catalog.db');
const db = new Database(filename);
db.exec(
  'CREATE TABLE "audio-tracks" (track_id TEXT PRIMARY KEY, audiotrack TEXT, title TEXT, performers TEXT, album TEXT, like INTEGER)'
);
const insert = db.prepare(
  'INSERT INTO "audio-tracks" (track_id, audiotrack, title) VALUES (@track_id, @audiotrack, @title)'
);
for (const entry of [a, b, c, d]) insert.run(entry);
const m3u = path.join(root, 'mixed.m3u');
await fs.writeFile(
  m3u,
  '\uFEFF#EXTM3U\r\n' +
    [
      b.audiotrack,
      d.audiotrack,
      a.audiotrack,
      c.audiotrack,
      b.audiotrack,
      path.join(root, 'uncatalogued.mp3')
    ].join('\r\n') +
    '\r\n'
);

test('music availability and catalog playlists', async (suite) => {
  try {
    await suite.test(
      'MP3 and FLAC remain in order while missing files and folders are reported separately',
      async () => {
        const result = await availableMusicTracks([b, d, a, c, b]);
        assert.deepEqual(result.tracks, [b, a, b]);
        assert.equal(result.unavailableCount, 2);
        assert.equal(result.examples[0].reason, 'folder-unavailable');
        assert.equal(result.examples[1].reason, 'file-missing');
      }
    );
    await suite.test('restoring a folder makes it available on the next operation', async () => {
      assert.equal((await createMusicAvailabilityCheck()(d.audiotrack)).available, false);
      await fs.rename(offline + '-disconnected', offline);
      assert.equal((await createMusicAvailabilityCheck()(d.audiotrack)).available, true);
      await fs.rename(offline, offline + '-disconnected');
    });
    await suite.test('directories and invalid locations cannot be played as files', async () => {
      const check = createMusicAvailabilityCheck();
      assert.equal((await check(online)).reason, 'not-file');
      assert.equal((await check(null)).reason, 'invalid-path');
    });
    await suite.test(
      'M3U preserves order and duplicates and reports uncatalogued entries',
      async () => {
        const result = await loadCatalogPlaylist(db, m3u);
        assert.deepEqual(
          result.tracks.map((t) => t.track_id),
          ['b', 'a', 'b']
        );
        assert.equal(result.requestedCount, 6);
        assert.equal(result.unavailableCount, 2);
        assert.equal(result.missingCatalogCount, 1);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM "audio-tracks"').get().n, 4);
      }
    );
    await suite.test(
      'relative M3U paths resolve from the playlist folder, with CRLF and comments supported',
      async () => {
        const relative = path.join(root, 'relative.m3u');
        await fs.writeFile(
          relative,
          '#EXTM3U\r\n#EXTINF:10,Example\r\nonline/a.mp3\r\nonline/b.flac\r\n'
        );
        assert.deepEqual(
          (await loadCatalogPlaylist(db, relative)).tracks.map((t) => t.track_id),
          ['a', 'b']
        );
        assert.deepEqual(parsePlaylist('..\\Album\\a.mp3\r\n', 'D:/Playlists/test.m3u'), [
          'D:/Album/a.mp3'
        ]);
        assert.deepEqual(parsePlaylist('\\\\server\\share\\a.flac', 'D:/Playlists/test.m3u'), [
          '//server/share/a.flac'
        ]);
      }
    );
    await suite.test(
      'all-unavailable and empty inputs return explicit results without deleting catalog rows',
      async () => {
        assert.equal((await availableMusicTracks([c, d])).tracks.length, 0);
        assert.deepEqual(await availableMusicTracks([]), {
          tracks: [],
          requestedCount: 0,
          unavailableCount: 0,
          missingCatalogCount: 0,
          examples: []
        });
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM "audio-tracks"').get().n, 4);
      }
    );
    await suite.test(
      'a large playlist keeps the batched query and preserves every occurrence',
      async () => {
        const large = path.join(root, 'large.m3u');
        await fs.writeFile(large, Array(5000).fill(a.audiotrack).join('\n'));
        assert.equal((await loadCatalogPlaylist(db, large)).tracks.length, 5000);
      }
    );
    await suite.test(
      'the playlist worker uses the supplied catalog and reports failures rather than undefined data',
      async () => {
        async function run(workerData) {
          const worker = new Worker(new URL('../src/main/loadPlaylistWorker.js', import.meta.url), {
            workerData
          });
          const result = new Promise((resolve, reject) => {
            worker.once('message', resolve);
            worker.once('error', reject);
            worker.once('exit', (code) => {
              if (code) reject(new Error(`exit ${code}`));
            });
          });
          worker.postMessage('');
          return result;
        }
        const result = await run({ dbPath: filename, data: [m3u] });
        assert.equal(result.data.tracks.length, 3);
        assert.match(
          (await run({ dbPath: filename, data: [path.join(root, 'missing.m3u')] })).error,
          /ENOENT/
        );
        assert((await run({ dbPath: path.join(root, 'missing.db'), data: [m3u] })).error);
      }
    );
  } finally {
    db.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
