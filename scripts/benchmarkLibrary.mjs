// Synthetic, disposable catalogs. No music files are read or modified.
// node scripts/benchmarkLibrary.mjs --sizes=10000,100000,500000,1000000 --output=docs/benchmarks/library-scale.json
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { readLibraryPage, libraryPageQuery } from '../src/main/libraryPages.js';
import { registerLibrarySearch } from '../src/main/librarySearch.js';
import { scanRoots } from '../src/main/utility/scanRoots.js';
import { commitScanChanges } from '../src/main/utility/scanWrites.js';
const require = createRequire(import.meta.url);
if (!process.versions.electron) {
  const result = spawnSync(
    require('electron'),
    ['--expose-gc', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: 'inherit',
      windowsHide: true
    }
  );
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
const Database = require('better-sqlite3');
const sizes = (
  process.argv.find((arg) => arg.startsWith('--sizes='))?.split('=')[1] ||
  '10000,100000,500000,1000000'
)
  .split(',')
  .map(Number);
if (sizes.some((size) => !Number.isInteger(size) || size < 1000 || size > 2000000))
  throw new Error('Invalid benchmark size');
const output = process.argv.find((arg) => arg.startsWith('--output='))?.slice(9);
const measure = (operation, count = 3) => {
  operation();
  const ms = [];
  for (let i = 0; i < count; i++) {
    const start = performance.now();
    operation();
    ms.push(performance.now() - start);
  }
  ms.sort((a, b) => a - b);
  return {
    medianMs: Number(ms[Math.floor(ms.length / 2)].toFixed(3)),
    maxMs: Number(ms.at(-1).toFixed(3)),
    samples: count
  };
};
const report = {
  generatedAt: new Date().toISOString(),
  platform: `${os.platform()} ${os.release()} ${os.arch()}`,
  cpu: os.cpus()[0]?.model,
  runtime: {
    electron: process.versions.electron,
    node: process.versions.node,
    sqlite: new Database(':memory:').prepare('SELECT sqlite_version() AS version').get().version
  },
  methodology:
    'Temporary on-disk WAL catalogs, 32 MiB SQLite cache, deterministic paths, ten tracks per album, equal album timestamps, accented names, and 256 bytes of metadata padding per track. Query timings include JS materialization and use warm-up plus three samples. Cursor anchors are located outside measured query time. Comparison uses the former OFFSET query shape. Scan timings measure catalog/path comparison and the transactional recheck only.',
  limitations: [
    'Synthetic data is not a real-library or cold-cache benchmark.',
    'Disk traversal, network/offline drive latency, audio metadata parsing, IPC and rendering are not included.',
    'Search remains a substring scan; paging does not create a text index.',
    'Single-machine timings vary with load and cache state.'
  ],
  results: []
};
for (const size of sizes) {
  console.log(`Benchmarking ${size.toLocaleString()} tracks...`);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'music-scale-'));
  const filename = path.join(temporary, 'catalog.db');
  const db = new Database(filename);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -32768');
    db.exec(`CREATE TABLE "audio-tracks" (track_id PRIMARY KEY, birthtime, audiotrack, like, performers, title, album, metadata);
      CREATE TABLE albums (id PRIMARY KEY, birthtime, fullpath, foldername, img);
      CREATE INDEX idx_audio_tracks_birthtime_id ON "audio-tracks" (birthtime, track_id);
      CREATE INDEX idx_albums_birthtime_id ON albums (birthtime, id);
      CREATE INDEX idx_albums_missing_cover_birthtime_id ON albums (birthtime, id) WHERE img IS NULL;
      CREATE INDEX idx_audio_tracks_audiotrack ON "audio-tracks" (audiotrack COLLATE NOCASE);`);
    registerLibrarySearch(db);
    const track = db.prepare('INSERT INTO "audio-tracks" VALUES (?, ?, ?, 0, ?, ?, ?, ?)');
    const album = db.prepare('INSERT INTO albums VALUES (?, ?, ?, ?, ?)');
    const fillStarted = performance.now();
    db.transaction(() => {
      let folder, birth, name;
      for (let i = 0; i < size; i++) {
        const group = Math.floor(i / 10),
          id = String(i).padStart(12, '0');
        if (i % 10 === 0) {
          name = `${group % 4000 === 0 ? 'Hélène' : 'Artist ' + (group % 1000)} - Album ${String(group).padStart(8, '0')}`;
          folder = `C:/Benchmark/${name}`;
          birth = new Date(1700000000000 + group * 1000).toISOString();
          album.run(
            String(group).padStart(12, '0'),
            birth,
            folder,
            name,
            group % 3 === 0 ? null : 'cover.jpg'
          );
        }
        track.run(
          id,
          birth,
          `${folder}/${String((i % 10) + 1).padStart(2, '0')}.flac`,
          'Artist',
          `Track ${(i % 10) + 1}`,
          name,
          'm'.repeat(256)
        );
      }
    })();
    const result = {
      tracks: size,
      albums: Math.ceil(size / 10),
      populateMs: Number((performance.now() - fillStarted).toFixed(3)),
      queries: {},
      scans: {}
    };
    db.pragma('wal_checkpoint(TRUNCATE)');
    result.catalogBytes = fs.statSync(filename).size;
    for (const kind of ['tracks', 'albums', 'covers']) {
      const definition =
        kind === 'tracks'
          ? {
              table: '"audio-tracks"',
              id: 'track_id',
              size: 200,
              fields: 'track_id, like, audiotrack, performers, title, album'
            }
          : {
              table: 'albums',
              id: 'id',
              size: kind === 'covers' ? 100 : 200,
              fields: kind === 'covers' ? 'id, foldername, fullpath, img' : '*'
            };
      const total = kind === 'tracks' ? size : result.albums;
      const depth = Math.floor((total * 0.9) / definition.size) * definition.size;
      const anchor = db
        .prepare(
          `SELECT birthtime, ${definition.id} AS id, rowid AS row FROM ${definition.table} ORDER BY birthtime DESC, ${definition.id} DESC, rowid DESC LIMIT 1 OFFSET ?`
        )
        .get(depth - 1);
      const cursor = {
        scope: JSON.stringify([kind, 'DESC', '', false]),
        key: [anchor.birthtime, anchor.id, anchor.row]
      };
      const options = { kind, sort: 'DESC', cursor };
      const offsetQuery = db.prepare(
        `SELECT ${definition.fields} FROM ${definition.table} ORDER BY birthtime DESC, ${definition.id} DESC, rowid DESC LIMIT ${definition.size} OFFSET ?`
      );
      result.queries[kind] = {
        firstPage: measure(() => readLibraryPage(db, { kind, sort: 'DESC' })),
        deepCursorPage: measure(() => readLibraryPage(db, options)),
        deepOffsetBaseline: measure(() => offsetQuery.all(depth)),
        offsetDepth: depth
      };
      const query = libraryPageQuery(options);
      result.queries[kind].cursorPlan = db
        .prepare('EXPLAIN QUERY PLAN ' + query.sql)
        .all(query.params)
        .map((row) => row.detail);
    }
    result.searches = {};
    for (const term of ['artist 42', 'helene', 'no-such-benchmark-token']) {
      result.searches[term] = measure(() =>
        readLibraryPage(db, { kind: 'tracks', sort: 'DESC', term })
      );
    }
    let stored = db
      .prepare('SELECT audiotrack FROM "audio-tracks"')
      .all()
      .map((row) => row.audiotrack);
    let start = performance.now();
    let scan = await scanRoots(['C:/Benchmark'], async () => stored);
    result.scans.enumerationOfSuppliedPathsMs = Number((performance.now() - start).toFixed(3));
    result.scans.compareUnchanged = measure(() => scan.compare(stored), 1);
    scan = null;
    globalThis.gc?.();
    const changes = Math.floor(size * 0.01);
    const observed = stored
      .slice(changes)
      .concat(
        Array.from({ length: changes }, (_, i) => `C:/Benchmark/New Artist - Album/${i}.flac`)
      );
    start = performance.now();
    scan = await scanRoots(['C:/Benchmark'], async () => observed);
    result.scans.changedEnumerationOfSuppliedPathsMs = Number(
      (performance.now() - start).toFixed(3)
    );
    const compared = scan.compare(stored);
    result.scans.added = compared.added.length;
    result.scans.missing = compared.missing.length;
    result.scans.compareOnePercentChange = measure(() => scan.compare(stored), 1);
    scan = null;
    stored = null;
    globalThis.gc?.();
    result.scans.transactionalRecheck = measure(
      () => commitScanChanges(db, 'files', [], [], () => {}),
      1
    );
    result.rssBytes = process.memoryUsage().rss;
    report.results.push(result);
    console.log(
      JSON.stringify({
        tracks: size,
        deepCursorMs: result.queries.tracks.deepCursorPage.medianMs,
        deepOffsetMs: result.queries.tracks.deepOffsetBaseline.medianMs,
        searchNoMatchMs: result.searches['no-such-benchmark-token'].medianMs,
        scanCompareMs: result.scans.compareUnchanged.medianMs
      })
    );
    if (output) {
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    }
  } finally {
    db.close();
    fs.rmSync(temporary, { recursive: true, force: true });
    globalThis.gc?.();
  }
}
if (!output) console.log(JSON.stringify(report, null, 2));
else console.log(`Benchmark report: ${path.resolve(output)}`);
