// PowerShell: $env:ELECTRON_RUN_AS_NODE='1'; ./node_modules/electron/dist/electron.exe --test scripts/testTrackRescan.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registerHooks, isBuiltin } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { test } from 'node:test';
import { build } from 'esbuild';

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'music-rescan-test-'));
const catalogPath = path.join(temporaryRoot, 'catalog-with-custom-name.db');
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
        .replaceAll('import.meta.env.MAIN_VITE_DB_PATH_DEV', JSON.stringify(catalogPath))
        .replaceAll('import.meta.env.MAIN_VITE_DB_BACKUP_DEV', JSON.stringify(temporaryRoot));
      return { format: 'module', source, shortCircuit: true };
    }
    return next(url, context);
  }
});
const { initializeCatalog } = await import('../src/main/catalogStartup.js');
const { getDB, closeDB } = await import('../src/main/connection.js');

const workerFile = path.join(temporaryRoot, 'rescan.cjs');
await build({
  entryPoints: [path.join(sourceRoot, 'rescanTrackErrorWorker.js')],
  outfile: workerFile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  plugins: [
    {
      name: 'resolve-test-dependencies',
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

function rescan(dbPath, track, id) {
  return new Promise((resolve, reject) => {
    const replies = [];
    const worker = new Worker(workerFile, { workerData: { dbPath, track, id } });
    const timeout = setTimeout(() => {
      void worker.terminate();
      reject(new Error('Rescan worker did not exit after its result.'));
    }, 10000);
    worker.on('message', (reply) => replies.push(reply));
    worker.once('error', reject);
    worker.once('exit', (code) => {
      clearTimeout(timeout);
      try {
        assert.equal(code, 0);
        assert.equal(replies.length, 1);
        assert.equal(replies[0].type, 'completed');
        assert.equal(replies[0].result.id, id);
        resolve(replies[0].result);
      } catch (error) {
        reject(error);
      }
    });
    worker.postMessage({ cmd: 'start' });
  });
}

const mp3 =
  '/+MYxAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxDsAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxHYAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';
const flac =
  'ZkxhQwAAACIBkAGQAAAAAAM1AfQA8AAAAAAAAAAAAAAAAAAAAAAAAAAAhAAALAwAAABMYXZmNjMuNC4xMDABAAAAFAAAAGVuY29kZXI9TGF2ZjYzLjQuMTAw//h0CAABjyQAAAB9Xw==';

test('error rescan uses the supplied catalog and completes every operation', async (suite) => {
  try {
    assert.equal(initializeCatalog().ok, true);
    const db = getDB();
    db.prepare('INSERT INTO roots(root) VALUES (?)').run(temporaryRoot);
    const insert = db.prepare(
      'INSERT INTO "audio-tracks"(track_id,audiotrack,like,error) VALUES (?,?,1,?)'
    );
    for (const [extension, bytes] of [
      ['mp3', mp3],
      ['flac', flac]
    ]) {
      const track = path.join(temporaryRoot, 'track.' + extension);
      fs.writeFileSync(track, Buffer.from(bytes, 'base64'));
      insert.run(extension, track, 'Previous error');
      await suite.test(
        'rescans ' + extension + ', clears its error and preserves its like',
        async () => {
          const result = await rescan(catalogPath, track, extension);
          assert.equal(result.success, true, result.error);
          assert.equal(result.rescanned.error, null);
          assert.equal(result.rescanned.like, 1);
          assert.equal(result.rescanned.track_id, extension);
          assert.equal(
            db.prepare('SELECT error FROM "audio-tracks" WHERE track_id=?').pluck().get(extension),
            null
          );
        }
      );
    }
    await suite.test(
      'missing and invalid files report errors and preserve the saved like',
      async () => {
        for (const name of ['missing', 'invalid']) {
          const track = path.join(temporaryRoot, name + '.mp3');
          if (name === 'invalid') fs.writeFileSync(track, 'Invalid audio');
          insert.run(name, track, 'Previous error');
          const result = await rescan(catalogPath, track, name);
          assert.equal(result.success, false);
          assert.ok(result.error);
          assert.equal(result.rescanned.like, 1);
          assert.equal(result.rescanned.error, result.error);
        }
      }
    );
    await suite.test('missing rows fail before touching an audio file', async () => {
      const track = path.join(temporaryRoot, 'track.mp3');
      const before = fs.readFileSync(track);
      const result = await rescan(catalogPath, track, 'unknown');
      assert.equal(result.success, false);
      assert.match(result.error, /no longer/);
      assert.deepEqual(fs.readFileSync(track), before);
    });
    await suite.test(
      'missing and damaged databases return failures and exit without creating catalogs',
      async () => {
        const missingDB = path.join(temporaryRoot, 'missing.db');
        const result = await rescan(missingDB, 'unused.mp3', 'missing-db');
        assert.equal(result.success, false);
        assert.equal(fs.existsSync(missingDB), false);
        const damagedDB = path.join(temporaryRoot, 'damaged.db');
        fs.writeFileSync(damagedDB, 'invalid database');
        const damaged = await rescan(damagedDB, 'unused.mp3', 'damaged-db');
        assert.equal(damaged.success, false);
        assert.ok(damaged.error);
      }
    );
  } finally {
    closeDB();
    hooks.deregister();
    assert.equal(path.dirname(temporaryRoot), os.tmpdir());
    assert.ok(path.basename(temporaryRoot).startsWith('music-rescan-test-'));
    fs.rmSync(temporaryRoot, { recursive: true });
  }
});
