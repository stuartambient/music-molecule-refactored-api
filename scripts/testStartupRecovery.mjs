// Run with Electron's Node runtime so better-sqlite3 uses the installed Electron ABI.
// PowerShell: $env:ELECTRON_RUN_AS_NODE='1'; ./node_modules/electron/dist/electron.exe scripts/testStartupRecovery.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'music-startup-test-'));
const catalogPath = path.join(temporaryRoot, 'catalog', 'test.db');
const backupRoot = path.join(temporaryRoot, 'backup-storage');
const sourceRoot = fileURLToPath(new URL('../src/main/', import.meta.url));
const electronStub =
  'data:text/javascript,' +
  encodeURIComponent(
    'export const app = { getPath: (name) => ' + JSON.stringify(temporaryRoot) + ' + "/" + name };'
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
        .replaceAll('import.meta.env.MAIN_VITE_DB_PATH_DEV', JSON.stringify(catalogPath))
        .replaceAll('import.meta.env.MAIN_VITE_DB_BACKUP_DEV', JSON.stringify(backupRoot));
      return { format: 'module', source, shortCircuit: true };
    }
    return next(url, context);
  }
});

const { initializeCatalog, repairCatalog } = await import('../src/main/catalogStartup.js');
const connection = await import('../src/main/connection.js');
const { restoreLatestBackup } = await import('../src/main/restoreBackup.js');
const { getRoots } = await import('../src/main/sql.js');
const { totalTracks } = await import('../src/main/stats.js');

function reset() {
  connection.closeDB();
  for (const filename of [catalogPath, catalogPath + '-wal', catalogPath + '-shm']) {
    if (fs.existsSync(filename)) fs.unlinkSync(filename);
  }
}

test('catalog startup and recovery', async (suite) => {
  try {
    await suite.test(
      'fresh install initializes the schema before queries and shares one handle',
      () => {
        assert.equal(fs.existsSync(path.dirname(catalogPath)), false);
        assert.deepEqual(initializeCatalog(), { ok: true });
        const db = connection.getDB();
        assert.equal(connection.openDatabase(), db);
        assert.equal(connection.default, db);
        assert.deepEqual(getRoots(), []);
        assert.deepEqual(totalTracks(), {
          albumsInfo: { 'COUNT(*)': 0 },
          tracksInfo: { 'COUNT(*)': 0 }
        });
        db.prepare('INSERT INTO roots(root) VALUES (?)').run('test music root');
        db.prepare('INSERT INTO "audio-tracks"(track_id, audiotrack, like) VALUES (?,?,?)').run(
          'retained-id',
          'test music root/song.mp3',
          1
        );
      }
    );

    await suite.test(
      'healthy startup preserves records and query imports follow a reopened handle',
      () => {
        const previous = connection.getDB();
        connection.closeDB();
        assert.throws(() => connection.getDB(), /not open/);
        assert.deepEqual(initializeCatalog(), { ok: true });
        assert.notEqual(connection.getDB(), previous);
        assert.equal(connection.default, connection.getDB());
        assert.deepEqual(getRoots(), ['test music root']);
        assert.equal(
          connection.getDB().prepare('SELECT like FROM "audio-tracks"').pluck().get(),
          1
        );
      }
    );

    fs.mkdirSync(connection.backupDirectory, { recursive: true });
    const goodBackup = path.join(connection.backupDirectory, 'backup-2026-01-01.db');
    await connection.getDB().backup(goodBackup);
    const corruptBackup = path.join(connection.backupDirectory, 'backup-2026-01-02.db');
    fs.writeFileSync(corruptBackup, 'invalid newest backup');

    await suite.test('repair handles a healthy catalog and reports an unrepairable one', () => {
      assert.equal(repairCatalog().fixed, true);
      reset();
      fs.writeFileSync(catalogPath, 'original damaged catalog');
      const before = fs.readFileSync(catalogPath);
      assert.equal(initializeCatalog().ok, false);
      assert.equal(repairCatalog().fixed, false);
      assert.throws(() => connection.getDB(), /not open/);
      assert.deepEqual(fs.readFileSync(catalogPath), before);
    });

    await suite.test(
      'restore skips the corrupt newest backup and preserves the previous files',
      async () => {
        fs.writeFileSync(catalogPath + '-wal', 'previous wal');
        fs.writeFileSync(catalogPath + '-shm', 'previous shm');
        const restored = await restoreLatestBackup();
        assert.equal(restored.restored, true);
        assert.equal(restored.backup, goodBackup);
        assert.equal(
          fs.readFileSync(restored.previousDatabase, 'utf8'),
          'original damaged catalog'
        );
        assert.equal(fs.readFileSync(restored.previousDatabase + '-wal', 'utf8'), 'previous wal');
        assert.equal(fs.readFileSync(restored.previousDatabase + '-shm', 'utf8'), 'previous shm');
        assert.equal(initializeCatalog().ok, true);
        assert.deepEqual(getRoots(), ['test music root']);
        assert.deepEqual(
          connection.getDB().prepare('SELECT track_id, like FROM "audio-tracks"').get(),
          { track_id: 'retained-id', like: 1 }
        );
      }
    );

    await suite.test(
      'restore refuses invalid backups without altering the active catalog',
      async () => {
        fs.unlinkSync(goodBackup);
        const handle = connection.getDB();
        const before = fs.readFileSync(catalogPath);
        const restored = await restoreLatestBackup();
        assert.equal(restored.restored, false);
        assert.match(restored.error, /No healthy/);
        assert.equal(connection.getDB(), handle);
        assert.deepEqual(fs.readFileSync(catalogPath), before);
        assert.equal(totalTracks().tracksInfo['COUNT(*)'], 1);
      }
    );

    await suite.test(
      'an installation failure rolls the previous database and sidecars back into place',
      async () => {
        await connection.getDB().backup(goodBackup);
        reset();
        fs.writeFileSync(catalogPath, 'catalog before failed installation');
        fs.writeFileSync(catalogPath + '-wal', 'wal before failed installation');
        const rename = fs.renameSync;
        fs.renameSync = (from, to) => {
          if (
            to === catalogPath &&
            path.basename(path.dirname(from)).startsWith('.catalog-restore-')
          ) {
            throw new Error('Injected restore installation failure');
          }
          return rename(from, to);
        };
        try {
          const result = await restoreLatestBackup();
          assert.equal(result.restored, false);
          assert.match(result.error, /Injected restore installation failure/);
          assert.equal(fs.readFileSync(catalogPath, 'utf8'), 'catalog before failed installation');
          assert.equal(
            fs.readFileSync(catalogPath + '-wal', 'utf8'),
            'wal before failed installation'
          );
        } finally {
          fs.renameSync = rename;
          fs.unlinkSync(goodBackup);
        }
      }
    );

    await suite.test(
      'missing catalog and backup directories return recoverable results',
      async () => {
        reset();
        fs.renameSync(path.dirname(catalogPath), path.join(temporaryRoot, 'preserved-catalog'));
        assert.equal(repairCatalog().fixed, false);
        assert.equal(fs.existsSync(catalogPath), false);
        fs.unlinkSync(corruptBackup);
        assert.equal((await restoreLatestBackup()).error, 'No backup files found.');
        fs.renameSync(connection.backupDirectory, path.join(backupRoot, 'preserved-backups'));
        assert.equal((await restoreLatestBackup()).error, 'Backup directory missing.');
        assert.equal(initializeCatalog().ok, true);
      }
    );
  } finally {
    connection.closeDB();
    hooks.deregister();
    // The deletion target is the unique temporary directory created above.
    assert.equal(path.dirname(temporaryRoot), os.tmpdir());
    assert.ok(path.basename(temporaryRoot).startsWith('music-startup-test-'));
    fs.rmSync(temporaryRoot, { recursive: true });
  }
});
