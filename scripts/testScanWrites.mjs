// Uses temporary catalogs only. Run with node scripts/testScanWrites.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createRequire, registerHooks, isBuiltin } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createScanCoordinator } from '../src/main/scanCoordinator.js';
import { commitScanChanges } from '../src/main/utility/scanWrites.js';
import { scanRoots } from '../src/main/utility/scanRoots.js';
const require = createRequire(import.meta.url);
if (!process.versions.electron) {
  const result = spawnSync(require('electron'), [fileURLToPath(import.meta.url)], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit',
    windowsHide: true
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
const Database = require('better-sqlite3');
const schema = `CREATE TABLE "audio-tracks" (track_id PRIMARY KEY, audiotrack, like);
CREATE TABLE albums (id PRIMARY KEY, fullpath, foldername);`;
const insert = (db, kind) => (rows) => {
  for (const row of rows) {
    if (kind === 'files')
      db.prepare('INSERT INTO "audio-tracks" VALUES (?, ?, ?)').run(
        row.track_id,
        row.audiotrack,
        row.like
      );
    else
      db.prepare('INSERT INTO albums VALUES (?, ?, ?)').run(row.id, row.fullpath, row.foldername);
  }
};

test('rechecks skip newly inserted scan candidates but preserve existing duplicates and likes', () => {
  const db = new Database(':memory:');
  try {
    db.exec(schema);
    const existing = [
      { track_id: 'one', audiotrack: 'C:/Music/Artist - Album/01.flac', like: 1 },
      { track_id: 'two', audiotrack: 'C:/Music/Artist - Album/01.flac', like: 0 }
    ];
    insert(db, 'files')(existing);
    const candidates = [
      { track_id: 'stale', audiotrack: existing[0].audiotrack, like: 0 },
      { track_id: 'fresh', audiotrack: 'D:/Music/Artist - Album/01.flac', like: 0 }
    ];
    const result = commitScanChanges(db, 'files', candidates, [], insert(db, 'files'));
    assert.deepEqual(result.added, [candidates[1]]);
    assert.deepEqual(
      db.prepare('SELECT * FROM "audio-tracks" WHERE audiotrack = ?').all(existing[0].audiotrack),
      existing
    );
    assert.equal(db.prepare('SELECT count(*) AS n FROM "audio-tracks"').get().n, 3);
    for (const table of ['audio-tracks', 'albums']) {
      assert(
        !db
          .prepare(`PRAGMA index_list('${table}')`)
          .all()
          .some((index) => index.unique && index.origin !== 'pk')
      );
    }
  } finally {
    db.close();
  }
});

test('matching album names under different roots are retained; stale additions are skipped', () => {
  const db = new Database(':memory:');
  try {
    db.exec(schema);
    const first = { id: 'a', fullpath: 'C:/Music/Artist - Album', foldername: 'Artist - Album' };
    const duplicate = { ...first, id: 'b' };
    insert(db, 'folders')([first, duplicate]);
    const elsewhere = { ...first, id: 'c', fullpath: 'D:/Music/Artist - Album' };
    const result = commitScanChanges(
      db,
      'folders',
      [{ ...first, id: 'stale' }, elsewhere, { ...elsewhere, id: 'batch-duplicate' }],
      [],
      insert(db, 'folders')
    );
    assert.deepEqual(result.added, [elsewhere]);
    assert.equal(db.prepare('SELECT count(*) AS n FROM albums').get().n, 3);
    assert.deepEqual(db.prepare('SELECT * FROM albums WHERE fullpath = ?').all(first.fullpath), [
      first,
      duplicate
    ]);
  } finally {
    db.close();
  }
});

test('scan additions and removals roll back together on a failed write', () => {
  const db = new Database(':memory:');
  try {
    db.exec(schema);
    insert(db, 'files')([{ track_id: 'old', audiotrack: 'old.flac', like: 1 }]);
    db.exec(
      `CREATE TRIGGER reject_scan_delete BEFORE DELETE ON "audio-tracks" BEGIN SELECT RAISE(ABORT, 'delete failed'); END;`
    );
    const candidate = { track_id: 'new', audiotrack: 'new.flac', like: 0 };
    assert.throws(
      () => commitScanChanges(db, 'files', [candidate], ['old.flac'], insert(db, 'files')),
      /delete failed/
    );
    assert.deepEqual(db.prepare('SELECT * FROM "audio-tracks"').all(), [
      { track_id: 'old', audiotrack: 'old.flac', like: 1 }
    ]);
  } finally {
    db.close();
  }
});

test('overlapping roots compare each discovered path once and preserve offline roots', async () => {
  const root = path.resolve('scan-fixture');
  const nested = path.join(root, 'Artist - Album');
  const offline = path.resolve('offline-fixture');
  const audio = path.join(nested, '01.flac');
  const oldOffline = path.join(offline, 'Artist - Album', '01.flac');
  const scan = await scanRoots([root, nested, offline], async (directory) => {
    if (directory === offline) throw new Error('Drive offline');
    return [audio];
  });
  assert.deepEqual(scan.compare([oldOffline]), { added: [audio], missing: [] });
});

function startWorker(t, dbPath, kind, rows, timeout = 5000) {
  const worker = new Worker(new URL('./scanWriteWorker.mjs', import.meta.url), {
    workerData: { dbPath, kind, rows, timeout }
  });
  let readyResolve, readyReject, doneResolve, doneReject, added;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  const done = new Promise((resolve, reject) => {
    doneResolve = resolve;
    doneReject = reject;
  });
  done.catch(() => {});
  worker.on('message', (message) => {
    if ('ready' in message) readyResolve(message.ready);
    if ('added' in message) added = message.added;
  });
  worker.on('error', (error) => {
    readyReject(error);
    doneReject(error);
  });
  worker.on('exit', (code) => {
    if (code !== 0 || added === undefined) {
      const error = new Error(`Commit worker exited ${code}`);
      readyReject(error);
      doneReject(error);
    } else doneResolve(added);
  });
  t.after(() => worker.terminate());
  return { ready, done, commit: () => worker.postMessage('commit') };
}

for (const kind of ['files', 'folders']) {
  test(
    `independent ${kind} workers recheck the same precomputed diff under a write lock`,
    { timeout: 10000 },
    async (t) => {
      const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'music-scan-write-'));
      const filename = path.join(temporary, 'catalog.db');
      const db = new Database(filename);
      try {
        db.pragma('journal_mode = WAL');
        db.exec(schema);
        const row =
          kind === 'files'
            ? { track_id: 'first', audiotrack: 'C:/Music/Artist - Album/01.flac', like: 0 }
            : { id: 'first', fullpath: 'C:/Music/Artist - Album', foldername: 'Artist - Album' };
        const other = { ...row, ...(kind === 'files' ? { track_id: 'second' } : { id: 'second' }) };
        const a = startWorker(t, filename, kind, [row]);
        const b = startWorker(t, filename, kind, [other]);
        assert.deepEqual(await Promise.all([a.ready, b.ready]), [1, 1]);
        a.commit();
        b.commit();
        assert.deepEqual((await Promise.all([a.done, b.done])).sort(), [0, 1]);
        const table = kind === 'files' ? '"audio-tracks"' : 'albums';
        assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 1);
      } finally {
        db.close();
        fs.rmSync(temporary, { recursive: true, force: true });
      }
    }
  );
}

test(
  'actual file and folder scans share scheduled/manual requests and preserve offline entries',
  { timeout: 20000 },
  async () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'music-scan-integration-'));
    const filename = path.join(temporary, 'custom-catalog.db');
    const db = new Database(filename);
    const roots = path.join(temporary, 'online');
    const firstAlbum = path.join(roots, 'Artist - Album');
    const secondAlbum = path.join(roots, 'Other - Album');
    const offlineRoot = path.join(temporary, 'offline');
    const normalize = (value) => value.replaceAll('\\', '/');
    const workers = [];
    try {
      fs.mkdirSync(firstAlbum, { recursive: true });
      fs.mkdirSync(secondAlbum);
      fs.writeFileSync(path.join(firstAlbum, 'old.flac'), 'existing fixture');
      fs.writeFileSync(path.join(firstAlbum, 'new.mp3'), 'unreadable new fixture');
      db.pragma('journal_mode = WAL');
      globalThis.scanIntegrationDb = db;
      const hooks = registerHooks({
        resolve(specifier, context, next) {
          if (specifier === './connection' && context.parentURL.endsWith('/sql.js')) {
            return {
              url: 'data:text/javascript,export default globalThis.scanIntegrationDb',
              shortCircuit: true
            };
          }
          return next(specifier, context);
        }
      });
      let sql;
      try {
        sql = await import('../src/main/sql.js');
      } finally {
        hooks.deregister();
        delete globalThis.scanIntegrationDb;
      }
      sql.initializeDatabase();
      sql.updateRoots([normalize(roots), normalize(firstAlbum), normalize(offlineRoot)]);
      const old = normalize(path.join(firstAlbum, 'old.flac'));
      const offlineTrack = normalize(path.join(offlineRoot, 'Artist - Album', 'old.flac'));
      const addTrack = db.prepare(
        'INSERT INTO "audio-tracks" (track_id, audiotrack, like) VALUES (?, ?, ?)'
      );
      addTrack.run('old-one', old, 1);
      addTrack.run('old-two', old, 0);
      addTrack.run('offline', offlineTrack, 1);
      const addAlbum = db.prepare('INSERT INTO albums (id, fullpath, foldername) VALUES (?, ?, ?)');
      addAlbum.run('old-one', normalize(firstAlbum), 'Artist - Album');
      addAlbum.run('old-two', normalize(firstAlbum), 'Artist - Album');
      addAlbum.run('offline', normalize(path.dirname(offlineTrack)), 'Artist - Album');
      const sourceRoot = fileURLToPath(new URL('../src/main/', import.meta.url));
      await build({
        entryPoints: [
          path.join(sourceRoot, 'updateFilesWorker.js'),
          path.join(sourceRoot, 'updateFoldersWorker.js')
        ],
        outdir: path.join(temporary, 'workers'),
        outExtension: { '.js': '.cjs' },
        bundle: true,
        platform: 'node',
        format: 'cjs',
        define: { 'import.meta.env.MODE': '"production"' },
        plugins: [
          {
            name: 'test-dependencies',
            setup(builder) {
              builder.onResolve({ filter: /^[^./]/ }, ({ path: specifier, kind }) => {
                if (path.isAbsolute(specifier)) return;
                if (isBuiltin(specifier)) return { path: specifier, external: true };
                const resolved = import.meta.resolve(specifier);
                return {
                  path: kind === 'dynamic-import' ? resolved : fileURLToPath(resolved),
                  external: true
                };
              });
            }
          }
        ]
      });
      const coordinate = createScanCoordinator();
      const run = (kind) =>
        coordinate({
          kind,
          workerData: filename,
          createWorker: ({ workerData }) => {
            const file = kind === 'files' ? 'updateFilesWorker.cjs' : 'updateFoldersWorker.cjs';
            const worker = new Worker(path.join(temporary, 'workers', file), { workerData });
            workers.push(worker);
            return worker;
          }
        });
      const files = run('files');
      const folders = run('folders');
      assert.equal(run('files'), files);
      assert.equal(run('folders'), folders);
      assert.equal(workers.length, 2);
      const [fileResult, folderResult] = await Promise.all([files, folders]);
      assert.deepEqual(fileResult.new, [normalize(path.join(firstAlbum, 'new.mp3'))]);
      assert.deepEqual(fileResult.deleted, []);
      assert.equal(folderResult.new, 1);
      assert.equal(folderResult.deleted, 0);
      assert.equal(fileResult.skippedRoots.length, 1);
      assert.equal(folderResult.skippedRoots.length, 1);
      const repeated = await Promise.all([run('files'), run('folders')]);
      assert(repeated.every((result) => result.nochange));
      assert.deepEqual(
        db
          .prepare(
            'SELECT track_id, like FROM "audio-tracks" WHERE audiotrack = ? ORDER BY track_id'
          )
          .all(old),
        [
          { track_id: 'old-one', like: 1 },
          { track_id: 'old-two', like: 0 }
        ]
      );
      assert.equal(
        db.prepare('SELECT like FROM "audio-tracks" WHERE track_id = ?').get('offline').like,
        1
      );
      assert.equal(db.prepare('SELECT count(*) AS n FROM "audio-tracks"').get().n, 4);
      assert.equal(db.prepare('SELECT count(*) AS n FROM albums').get().n, 4);
    } finally {
      await Promise.all(workers.map((worker) => worker.terminate()));
      db.close();
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }
);

test(
  'a blocked scan times out without partial writes and can retry after the lock is released',
  { timeout: 10000 },
  async (t) => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'music-scan-lock-'));
    const filename = path.join(temporary, 'catalog.db');
    const db = new Database(filename);
    try {
      db.pragma('journal_mode = WAL');
      db.exec(schema);
      const row = { track_id: 'candidate', audiotrack: 'C:/Music/Artist - Album/01.flac', like: 1 };
      const blocked = startWorker(t, filename, 'files', [row], 100);
      await blocked.ready;
      db.exec('BEGIN IMMEDIATE');
      blocked.commit();
      await assert.rejects(
        blocked.done,
        (error) => error.code === 'SQLITE_BUSY' || /locked/.test(error.message)
      );
      assert.equal(db.prepare('SELECT count(*) AS n FROM "audio-tracks"').get().n, 0);
      db.exec('ROLLBACK');
      const retry = startWorker(t, filename, 'files', [row]);
      await retry.ready;
      retry.commit();
      assert.equal(await retry.done, 1);
      assert.equal(db.prepare('SELECT like FROM "audio-tracks"').get().like, 1);
    } finally {
      if (db.inTransaction) db.exec('ROLLBACK');
      db.close();
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }
);

test(
  'terminating a worker during root replacement exposes no partial roots and rolls back',
  { timeout: 10000 },
  async (t) => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'music-root-interruption-'));
    const filename = path.join(temporary, 'catalog.db');
    const db = new Database(filename);
    let worker;
    try {
      db.pragma('journal_mode = WAL');
      db.exec(
        "CREATE TABLE roots (id INTEGER PRIMARY KEY, root TEXT UNIQUE); INSERT INTO roots (root) VALUES ('C:/Original');"
      );
      db.exec(
        'CREATE TRIGGER pause_root_write BEFORE INSERT ON roots BEGIN SELECT pause_root_write(); END;'
      );
      worker = new Worker(new URL('./rootUpdateWorker.mjs', import.meta.url), {
        workerData: filename
      });
      t.after(() => worker.terminate());
      await new Promise((resolve, reject) => {
        worker.once('message', resolve);
        worker.once('error', reject);
      });
      assert.deepEqual(
        db.prepare('SELECT root FROM roots').all(),
        [{ root: 'C:/Original' }],
        'Another handle saw uncommitted root changes'
      );
      await worker.terminate();
      assert.deepEqual(db.prepare('SELECT root FROM roots').all(), [{ root: 'C:/Original' }]);
      db.exec('DROP TRIGGER pause_root_write');
      db.prepare('INSERT INTO roots(root) VALUES (?)').run('D:/After interruption');
      assert.equal(db.prepare('SELECT count(*) AS n FROM roots').get().n, 2);
    } finally {
      if (worker) await worker.terminate();
      db.close();
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }
);
