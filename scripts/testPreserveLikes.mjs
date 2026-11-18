// PowerShell: $env:ELECTRON_RUN_AS_NODE='1'; ./node_modules/electron/dist/electron.exe --test scripts/testPreserveLikes.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'music-likes-test-'));
const sourceRoot = fileURLToPath(new URL('../src/main/', import.meta.url));
const electronStub =
  'data:text/javascript,' +
  encodeURIComponent(
    'export const app = { getPath: () => ' + JSON.stringify(temporaryRoot) + ' };'
  );
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'electron') return { url: electronStub, shortCircuit: true };
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') && !path.extname(specifier))
        return next(specifier + '.js', context);
      throw error;
    }
  },
  load(url, context, next) {
    if (url.startsWith('file:') && fileURLToPath(url).startsWith(sourceRoot)) {
      const source = fs
        .readFileSync(fileURLToPath(url), 'utf8')
        .replaceAll('import.meta.env.PROD', 'false')
        .replaceAll(
          'import.meta.env.MAIN_VITE_DB_PATH_DEV',
          JSON.stringify(path.join(temporaryRoot, 'music.db'))
        )
        .replaceAll('import.meta.env.MAIN_VITE_DB_BACKUP_DEV', JSON.stringify(temporaryRoot));
      return { format: 'module', source, shortCircuit: true };
    }
    return next(url, context);
  }
});

const { initializeCatalog } = await import('../src/main/catalogStartup.js');
const { getDB, closeDB } = await import('../src/main/connection.js');
const { parseMeta, insertFiles, updateFiles } = await import('../src/main/utility/utils.js');
const { likeTrack } = await import('../src/main/sql.js');

// 50 ms of silent MP3 audio, generated with FFmpeg/libmp3lame at 8 kb/s.
// Keeping the fixture inline makes this check independent of a local music library or FFmpeg install.
const mp3 = Buffer.from(
  '/+MYxAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxDsAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxHYAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV',
  'base64'
);

test('metadata updates preserve user likes', async (suite) => {
  try {
    assert.equal(initializeCatalog().ok, true);
    const db = getDB();
    const audio = path.join(temporaryRoot, 'track.mp3');
    const broken = path.join(temporaryRoot, 'broken.mp3');
    fs.writeFileSync(audio, mp3);
    fs.writeFileSync(broken, 'unreadable audio fixture');
    const root = () => temporaryRoot;
    const liked = () =>
      db.prepare('SELECT like FROM "audio-tracks" WHERE track_id = ?').pluck().get(trackId);
    let trackId;

    await suite.test('new readable and unreadable tracks start unliked', async () => {
      const rows = await parseMeta([audio, broken], 'new', root);
      assert.equal(rows[0].error, null, 'The MP3 fixture must parse successfully.');
      assert.ok(rows[1].error);
      assert.equal(rows[0].like, 0);
      assert.equal(rows[1].like, 0);
      assert.equal(insertFiles(db, rows).success, true);
      trackId = rows[0].track_id;
      assert.equal(liked(), 0);
    });

    await suite.test(
      'refresh preserves liked and unliked tracks and returns the current saved value',
      async () => {
        likeTrack(trackId);
        for (const expected of [1, 0]) {
          if (expected === 0) likeTrack(trackId);
          // The worker inputs include IDs and paths without a saved like value.
          const rows = await parseMeta([{ id: audio, track_id: trackId }], 'mod', root);
          assert.equal(Object.hasOwn(rows[0], 'like'), false);
          rows[0].title = 'Updated metadata ' + expected;
          const result = updateFiles(db, rows);
          assert.equal(result.success, true);
          assert.equal(liked(), expected);
          assert.equal(result.files[0].like, expected);
          assert.equal(result.files[0].title, rows[0].title);
        }
      }
    );

    await suite.test('a like toggled after parsing survives the metadata write', async () => {
      const rows = await parseMeta([{ id: audio, track_id: trackId, like: 0 }], 'mod', root);
      likeTrack(trackId);
      assert.equal(updateFiles(db, rows).success, true);
      assert.equal(liked(), 1);
    });

    await suite.test('a parse failure preserves the like and existing title', async () => {
      const title = db
        .prepare('SELECT title FROM "audio-tracks" WHERE track_id = ?')
        .pluck()
        .get(trackId);
      const rows = await parseMeta([{ id: broken, track_id: trackId }], 'mod', root);
      assert.ok(rows[0].error);
      assert.equal(Object.hasOwn(rows[0], 'like'), false);
      const result = updateFiles(db, rows);
      assert.equal(result.success, true);
      assert.equal(liked(), 1);
      assert.equal(result.files[0].title, title);
    });
  } finally {
    closeDB();
    hooks.deregister();
    assert.equal(path.dirname(temporaryRoot), os.tmpdir());
    assert.ok(path.basename(temporaryRoot).startsWith('music-likes-test-'));
    fs.rmSync(temporaryRoot, { recursive: true });
  }
});
