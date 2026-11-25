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

const { default: Database } = await import('better-sqlite3');
const { updateFiles } = await import('../src/main/utility/utils.js');
const { refreshMetadata, updateChangedMetadata } = await import('../src/main/metadataRefresh.js');
const db = new Database(':memory:');
db.exec(`CREATE TABLE "audio-tracks" (track_id TEXT PRIMARY KEY, title TEXT, modified REAL, "like" INTEGER);
  INSERT INTO "audio-tracks" VALUES ('good', 'Old', 1, 1), ('bad', 'Keep', 1, 1);`);
const rows = () => db.prepare('SELECT * FROM "audio-tracks" ORDER BY track_id').all();
const tracks = () => rows().map((row) => ({ ...row, audiotrack: row.track_id }));
const options = {
  stat: async () => ({ mtimeMs: 2 }),
  parse: async (files) =>
    files.map((file) => ({ track_id: file.track_id, title: 'New', modified: 2 })),
  save: (files) => updateFiles(db, files)
};

test('file read failures do not stop healthy refreshes or advance failed timestamps', async () => {
  const result = await updateChangedMetadata([...tracks(), { audiotrack: 'missing' }], {
    ...options,
    stat: async (file) => {
      if (file === 'missing') throw new Error('ENOENT');
      return { mtimeMs: 2 };
    },
    parse: async (files) =>
      files.map((file) =>
        file.track_id === 'bad'
          ? { track_id: 'bad', audiotrack: file.id, modified: 2, error: 'Invalid tags' }
          : { track_id: file.track_id, title: 'New', modified: 2 }
      )
  });
  assert.equal(result.modified, 1);
  assert.equal(result.failed, 2);
  assert.equal(result.nochange, false);
  assert.deepEqual(
    rows().map(({ title, modified, like }) => [title, modified, like]),
    [
      ['Keep', 1, 1],
      ['New', 2, 1]
    ]
  );
});

test('SQL failure rolls back and can be retried', async () => {
  db.exec(`CREATE TRIGGER reject_refresh BEFORE UPDATE ON "audio-tracks"
    BEGIN SELECT RAISE(ABORT, 'simulated database failure'); END;`);
  const before = rows();
  await assert.rejects(
    updateChangedMetadata(tracks(), options),
    /Database metadata refresh failed.*simulated database failure/
  );
  assert.deepEqual(rows(), before);
  db.exec('DROP TRIGGER reject_refresh');
  assert.equal((await updateChangedMetadata(tracks(), options)).modified, 1);
});

test('missing row rolls back earlier writes instead of returning success', async () => {
  const before = rows();
  await assert.rejects(
    refreshMetadata([], {
      parse: async () => [
        { track_id: 'good', title: 'Rollback' },
        { track_id: 'deleted', title: 'Missing' }
      ],
      save: options.save
    }),
    /Track no longer exists/
  );
  assert.deepEqual(rows(), before);
});

test('no changes and failed checks have different results and bounded failure examples', async () => {
  assert.deepEqual(await updateChangedMetadata(tracks(), options), {
    modified: 0,
    failed: 0,
    failures: [],
    nochange: true,
    details: { missing: [], bad: [], modified: [] }
  });
  const result = await updateChangedMetadata(
    Array.from({ length: 100 }, (_, i) => ({ audiotrack: String(i) })),
    {
      ...options,
      stat: async () => {
        throw new Error('Offline');
      }
    }
  );
  assert.equal(result.failed, 100);
  assert.equal(result.failures.length, 10);
  assert.equal(result.nochange, false);
});
test('detailed report retains every path and separates missing, unreadable, parsed and saved files', async () => {
  const files = ['missing', 'denied', 'malformed', 'vanished', 'saved'].map((id) => ({
    track_id: id,
    audiotrack: `I:/Music/${id}.flac`,
    modified: 1
  }));
  const result = await updateChangedMetadata(files, {
    stat: async (path) => {
      if (path.includes('missing'))
        throw Object.assign(new Error('File missing'), { code: 'ENOENT' });
      if (path.includes('denied'))
        throw Object.assign(new Error('Access denied'), { code: 'EACCES' });
      return { mtimeMs: 2 };
    },
    parse: async (input) =>
      input.map((file) => ({
        track_id: file.track_id,
        audiotrack: file.id,
        error:
          file.track_id === 'malformed'
            ? 'Invalid FLAC header'
            : file.track_id === 'vanished'
              ? 'Error: ENOENT: no such file'
              : null
      })),
    save: async (input) => ({ success: true, files: input })
  });
  assert.equal(result.modified, 1);
  assert.equal(result.failed, 4);
  assert.deepEqual(
    result.details.missing.map((file) => file.track_id),
    ['missing', 'vanished']
  );
  assert.deepEqual(
    result.details.bad.map((file) => file.track_id),
    ['denied', 'malformed']
  );
  assert.equal(result.details.modified[0].id, 'I:/Music/saved.flac');
  const many = await updateChangedMetadata(
    Array.from({ length: 117 }, (_, i) => ({ audiotrack: `${i}.flac` })),
    {
      ...options,
      stat: async () => {
        throw Object.assign(new Error('Missing'), { code: 'ENOENT' });
      }
    }
  );
  assert.equal(many.details.missing.length, 117);
});

test('failed database report preserves file failures and does not claim rolled-back rows as modified', async () => {
  await assert.rejects(
    updateChangedMetadata(
      [
        { track_id: 'missing', audiotrack: 'missing.flac', modified: 1 },
        { track_id: 'invalid', audiotrack: 'invalid.flac', modified: 1 },
        { track_id: 'good', audiotrack: 'good.flac', modified: 1 }
      ],
      {
        stat: async (path) => {
          if (path === 'missing.flac')
            throw Object.assign(new Error('Missing'), { code: 'ENOENT' });
          return { mtimeMs: 2 };
        },
        parse: async (files) =>
          files.map((file) => ({
            track_id: file.track_id,
            audiotrack: file.id,
            error: file.track_id === 'invalid' ? 'Invalid tags' : null
          })),
        save: async () => ({ success: false, message: 'SQLITE_BUSY' })
      }
    ),
    (error) => {
      assert.equal(error.report.modified, 0);
      assert.equal(error.report.failed, 3);
      assert.equal(error.report.details.missing.length, 1);
      assert.equal(error.report.details.bad.length, 2);
      assert.deepEqual(error.report.details.modified, []);
      assert.match(error.report.error, /SQLITE_BUSY/);
      return true;
    }
  );
});

test('tag worker reports database failure, parse failure, and committed success accurately', async () => {
  const { build } = await import('esbuild');
  const { isBuiltin } = await import('node:module');
  const { Worker } = await import('node:worker_threads');
  const workerFile = path.join(temporaryRoot, 'tag-worker.cjs');
  const catalog = path.join(temporaryRoot, 'tags.db');
  new Database(catalog).close();
  await build({
    entryPoints: [path.join(sourceRoot, 'updateTagsWorker.js')],
    outfile: workerFile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    plugins: [
      {
        name: 'isolated-tag-test',
        setup(builder) {
          builder.onLoad({ filter: /updateTags\.js$/ }, () => ({
            contents: `export default async () => ({ errors: [] });`
          }));
          builder.onLoad({ filter: /utility[\\/]utils\.js$/ }, () => ({
            contents: `
        import { workerData } from 'node:worker_threads';
        export const parseMeta = async () => [{ track_id: 'one', audiotrack: 'fixture',
          error: workerData.mode === 'parse' ? 'Unreadable metadata' : null }];
        export const updateFiles = (_, files) => workerData.mode === 'save'
          ? { success: false, message: 'SQLITE_BUSY' } : { success: true, files };
      `
          }));
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
  async function run(mode) {
    return new Promise((resolve, reject) => {
      const replies = [];
      const worker = new Worker(workerFile, {
        workerData: { workerPath: catalog, data: [{ track_id: 'one', id: 'fixture' }], mode }
      });
      const timer = setTimeout(() => {
        void worker.terminate();
        reject(new Error('Worker timed out'));
      }, 10000);
      worker.on('message', (msg) => replies.push(msg));
      worker.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      worker.once('exit', (code) => {
        clearTimeout(timer);
        try {
          assert.equal(code, 0);
          assert.equal(replies.length, 1);
          resolve(replies[0]);
        } catch (error) {
          reject(error);
        }
      });
      worker.postMessage('');
    });
  }
  const failed = await run('save');
  assert.equal(failed.status, 'error');
  assert.match(failed.error, /Database metadata refresh failed.*SQLITE_BUSY.*retry/);
  const unreadable = await run('parse');
  assert.equal(unreadable.status, 'failed');
  assert.equal(unreadable.failed.length, 1);
  assert.deepEqual(unreadable.res.files, []);
  const success = await run('ok');
  assert.equal(success.status, 'success');
  assert.equal(success.res.files.length, 1);
});

process.on('exit', () => {
  db.close();
  hooks.deregister();
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
});
