// PowerShell: $env:ELECTRON_RUN_AS_NODE='1'; ./node_modules/electron/dist/electron.exe scripts/testVerifiedTagSaves.mjs
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
const { File } = await import('node-taglib-sharp');
const { createHash } = await import('node:crypto');
const { default: updateTags } = await import('../src/main/updateTags.js');
const { parseMeta, insertFiles, updateFiles } = await import('../src/main/utility/utils.js');
const { expectedTagValues, verifyTagValues } = await import('../src/main/tagVerification.js');
const { runTagSaveBatch } = await import('../src/main/tagSaveWorkflow.js');
const { createTagSaveJournal, pendingTagSaveSummary } = await import(
  '../src/main/tagSaveJournal.js'
);
const mp3 =
  '/+MYxAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxDsAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxHYAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';
const flac =
  'ZkxhQwAAACIBkAGQAAAAAAM1AfQA8AAAAAAAAAAAAAAAAAAAAAAAAAAAhAAALAwAAABMYXZmNjMuNC4xMDABAAAAFAAAAGVuY29kZXI9TGF2ZjYzLjQuMTAw//h0CAABjyQAAAB9Xw==';

assert.equal(initializeCatalog().ok, true);
const db = getDB();
const root = () => temporaryRoot;
const digest = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function track(name, format = 'mp3') {
  const id = path.join(temporaryRoot, `${name}.${format}`);
  fs.writeFileSync(id, Buffer.from(format === 'mp3' ? mp3 : flac, 'base64'));
  const [row] = await parseMeta([id], 'new', root);
  assert.equal(row.error, null);
  assert.equal(insertFiles(db, [row]).success, true);
  db.prepare('UPDATE "audio-tracks" SET "like"=1 WHERE track_id=?').run(row.track_id);
  return { id, track_id: row.track_id };
}
const options = {
  db,
  expect: expectedTagValues,
  write: (edit) => updateTags(db, [edit]),
  verify: verifyTagValues,
  parse: (files) => parseMeta(files, 'mod', root),
  save: (files) => updateFiles(db, files),
  inspect: (file) => fs.promises.stat(file)
};
const saved = (id) => db.prepare('SELECT * FROM "audio-tracks" WHERE track_id=?').get(id);

test('real MP3 and FLAC saves are reopened, verified and reflected in the catalog', async () => {
  for (const format of ['mp3', 'flac']) {
    const file = await track(`confirmed-${format}`, format);
    const result = await runTagSaveBatch({
      ...options,
      edits: [
        {
          ...file,
          updates: { title: 'Verified title', year: 2026, genres: 'Jazz, Rock', album: 'Album' }
        }
      ]
    });
    assert.equal(result.status, 'success', JSON.stringify(result.outcomes));
    assert.equal(result.outcomes[0].verification.status, 'confirmed');
    assert.equal(saved(file.track_id).title, 'Verified title');
    assert.equal(saved(file.track_id).like, 1);
    assert.equal(result.pending.length, 0);
    const cleared = await runTagSaveBatch({
      ...options,
      edits: [{ ...file, updates: { title: '-', year: '-', genres: '-' } }]
    });
    assert.equal(cleared.status, 'success', JSON.stringify(cleared.outcomes));
    assert.equal(saved(file.track_id).title, null);
  }
});

test('one failed catalog update keeps its recovery record while another file commits', async () => {
  const blocked = await track('blocked'),
    good = await track('independent');
  db.exec(
    `CREATE TRIGGER reject_tag_refresh BEFORE UPDATE ON "audio-tracks" WHEN NEW.track_id='${blocked.track_id}' BEGIN SELECT RAISE(ABORT,'Simulated lock'); END;`
  );
  const result = await runTagSaveBatch({
    ...options,
    edits: [blocked, good].map((file) => ({ ...file, updates: { title: 'Saved on disk' } }))
  });
  assert.equal(result.status, 'partial_status');
  assert.equal(result.outcomes[0].outcome, 'Tags saved; catalog refresh failed');
  assert.equal(result.outcomes[0].verification.status, 'confirmed');
  assert.equal(saved(blocked.track_id).title, null);
  assert.equal(saved(good.track_id).title, 'Saved on disk');
  assert.equal(result.pending.length, 1);
  const before = digest(blocked.id);
  db.exec('DROP TRIGGER reject_tag_refresh');
  const retry = await runTagSaveBatch({
    ...options,
    retry: true,
    write: () => {
      throw new Error('Recovery must not write tags');
    }
  });
  assert.equal(retry.status, 'success');
  assert.equal(retry.recovery, true);
  assert.equal(saved(blocked.track_id).title, 'Saved on disk');
  assert.equal(saved(blocked.track_id).like, 1);
  assert.equal(digest(blocked.id), before);
  assert.equal(retry.pending.length, 0);
});

test('a thrown tag setter is reported and actual on-disk metadata still refreshes', async () => {
  const file = await track('field-failure');
  const open = File.createFromPath;
  try {
    File.createFromPath = (...args) => {
      const opened = open(...args);
      Object.defineProperty(opened.tag, 'title', {
        configurable: true,
        get: () => undefined,
        set: () => {
          throw new Error('Simulated title setter failure');
        }
      });
      return opened;
    };
    const result = await runTagSaveBatch({
      ...options,
      edits: [{ ...file, updates: { title: 'Rejected', album: 'This field saves' } }]
    });
    assert.equal(result.status, 'failed');
    assert.match(result.failed[0].error, /title setter failure/);
    assert.equal(result.outcomes[0].catalog.status, 'updated');
    assert.equal(saved(file.track_id).title, null);
    assert.equal(saved(file.track_id).album, 'This field saves');
    assert.equal(result.pending.length, 1);
  } finally {
    File.createFromPath = open;
  }
  // Correcting the requested edit is an explicit new save, not recovery rewriting it.
  const fixed = await runTagSaveBatch({
    ...options,
    edits: [{ ...file, updates: { title: 'Corrected' } }]
  });
  assert.equal(fixed.status, 'success');
});

test('journal records survive reopening; an interruption before writing is never confirmed or replayed', async () => {
  const file = await track('interrupted-before');
  const expected = expectedTagValues({ ...file, updates: { title: 'Not yet saved' } });
  createTagSaveJournal(db).begin(file, expected);
  const before = digest(file.id);
  const { default: Database } = await import('better-sqlite3');
  const { dbPath } = await import('../src/main/connection.js');
  const reopened = new Database(dbPath, { fileMustExist: true });
  const retry = await runTagSaveBatch({
    ...options,
    db: reopened,
    retry: true,
    write: () => {
      throw new Error('Must not replay');
    }
  });
  reopened.close();
  const outcome = retry.outcomes.find((row) => row.track_id === file.track_id);
  assert.equal(outcome.success, false);
  assert.equal(outcome.verification.status, 'mismatch');
  assert.equal(outcome.catalog.status, 'updated');
  assert.equal(digest(file.id), before);
  assert.equal(saved(file.track_id).title, null);
  assert.ok(pendingTagSaveSummary(db).some((row) => row.track_id === file.track_id));
  createTagSaveJournal(db).finish(file.track_id);
});

test('file changes during verification cannot report success or commit a stale metadata snapshot', async () => {
  const file = await track('changing-file');
  let checks = 0;
  const result = await runTagSaveBatch({
    ...options,
    edits: [{ ...file, updates: { title: 'Racing edit' } }],
    inspect: async () => ({ mtimeMs: ++checks, size: 123 })
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.outcomes[0].verification.status, 'unavailable');
  assert.equal(saved(file.track_id).title, null);
  assert.match(result.failed[0].error, /File changed/);
  const retry = await runTagSaveBatch({ ...options, retry: true });
  assert.equal(retry.status, 'success');
});

test('artwork addition and deletion are verified for MP3 and FLAC', async () => {
  const image = path.join(temporaryRoot, 'art.png');
  fs.writeFileSync(
    image,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64'
    )
  );
  for (const format of ['mp3', 'flac']) {
    const file = await track(`art-${format}`, format);
    const added = await runTagSaveBatch({
      ...options,
      edits: [{ ...file, updates: { 'picture-location': image } }]
    });
    assert.equal(added.status, 'success', JSON.stringify(added.outcomes));
    assert.equal(saved(file.track_id).pictures, 1);
    const removed = await runTagSaveBatch({
      ...options,
      edits: [{ ...file, updates: { pictures: '-' } }]
    });
    assert.equal(removed.status, 'success', JSON.stringify(removed.outcomes));
    assert.equal(saved(file.track_id).pictures, 0);
  }
});

test('a terminated worker leaves a durable job and recovery updates the catalog without rewriting audio', async () => {
  const { Worker } = await import('node:worker_threads');
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const { dbPath } = await import('../src/main/connection.js');
  const file = await track('crashed-after-write');
  const expected = expectedTagValues({ ...file, updates: { title: 'Written before crash' } });
  const worker = new Worker(
    `
    const {parentPort,workerData}=require('node:worker_threads');
    const Database=require(workerData.databaseModule);
    const {File}=require(workerData.tagModule);
    (async()=>{
      const {createTagSaveJournal}=await import(workerData.journalModule);
      const db=new Database(workerData.catalog);
      createTagSaveJournal(db).begin(workerData.file, workerData.expected);
      const audio=File.createFromPath(workerData.file.id); audio.tag.title='Written before crash'; audio.save(); audio.dispose();
      parentPort.postMessage('written'); setInterval(()=>{},1000);
    })().catch(error=>{throw error});
  `,
    {
      eval: true,
      workerData: {
        catalog: dbPath,
        file,
        expected,
        databaseModule: require.resolve('better-sqlite3'),
        tagModule: require.resolve('node-taglib-sharp'),
        journalModule: new URL('../src/main/tagSaveJournal.js', import.meta.url).href
      }
    }
  );
  await new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
  });
  await worker.terminate();
  assert.equal(saved(file.track_id).title, null);
  const before = digest(file.id);
  const result = await runTagSaveBatch({
    ...options,
    retry: true,
    write: () => {
      throw new Error('Must not rewrite');
    }
  });
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.equal(saved(file.track_id).title, 'Written before crash');
  assert.equal(digest(file.id), before);
  assert.equal(result.pending.length, 0);
});

test('no audio file is written when the durable recovery record cannot be created', async () => {
  const file = await track('journal-blocked');
  const before = digest(file.id);
  db.exec(
    `CREATE TRIGGER reject_tag_job BEFORE INSERT ON tag_save_jobs BEGIN SELECT RAISE(ABORT, 'Journal unavailable'); END;`
  );
  let writes = 0;
  try {
    const result = await runTagSaveBatch({
      ...options,
      edits: [{ ...file, updates: { title: 'Must not be written' } }],
      write: async () => {
        writes++;
        return { errors: [] };
      }
    });
    assert.equal(result.status, 'failed');
    assert.equal(result.outcomes[0].outcome, 'Tag write not started');
    assert.equal(writes, 0);
    assert.equal(digest(file.id), before);
  } finally {
    db.exec('DROP TRIGGER reject_tag_job');
  }
});

test('the real bundled save worker verifies and refreshes a file in the supplied catalog', async () => {
  const { build } = await import('esbuild');
  const { isBuiltin } = await import('node:module');
  const { Worker } = await import('node:worker_threads');
  const { dbPath } = await import('../src/main/connection.js');
  const file = await track('worker-integration');
  const workerFile = path.join(temporaryRoot, 'verified-save-worker.cjs');
  await build({
    entryPoints: [path.join(sourceRoot, 'updateTagsWorker.js')],
    outfile: workerFile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    plugins: [
      {
        name: 'external-native-dependencies',
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
  const result = await new Promise((resolve, reject) => {
    const replies = [];
    const worker = new Worker(workerFile, {
      workerData: {
        workerPath: dbPath,
        data: [{ ...file, updates: { title: 'Verified by real worker' } }]
      }
    });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error('Worker did not finish'));
    }, 10000);
    worker.on('message', (reply) => replies.push(reply));
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
  assert.equal(result.status, 'success', JSON.stringify(result));
  assert.equal(result.outcomes[0].verification.status, 'confirmed');
  assert.equal(result.outcomes[0].catalog.status, 'updated');
  assert.equal(saved(file.track_id).title, 'Verified by real worker');
  assert.equal(result.pending.length, 0);
});

test('forget removes only the reviewed recovery record and leaves files and catalog entries intact', async () => {
  const { forgetTagSaveJob } = await import('../src/main/tagSaveJournal.js');
  const one = await track('forget-one'),
    two = await track('keep-two');
  const journal = createTagSaveJournal(db);
  journal.begin(one, { title: 'Unfinished edit' });
  journal.begin(two, { title: 'Another edit' });
  const before = saved(one.track_id),
    audioBefore = digest(one.id);
  const record = pendingTagSaveSummary(db).find((row) => row.track_id === one.track_id);
  const result = forgetTagSaveJob(db, record);
  assert.equal(result.removed, true);
  assert.deepEqual(saved(one.track_id), before);
  assert.equal(digest(one.id), audioBefore);
  assert.deepEqual(
    result.pending.map((row) => row.track_id),
    [two.track_id]
  );
  assert.equal(forgetTagSaveJob(db, record).removed, false);
  journal.finish(two.track_id);
});

test('forget rejects a stale reviewed record instead of removing a newer pending save', async () => {
  const { forgetTagSaveJob } = await import('../src/main/tagSaveJournal.js');
  const file = await track('forget-stale');
  const journal = createTagSaveJournal(db);
  journal.begin(file, { title: 'First request' });
  const old = pendingTagSaveSummary(db)[0];
  journal.begin(file, { title: 'New request' });
  assert.throws(() => forgetTagSaveJob(db, old), /unfinished save changed/);
  const current = pendingTagSaveSummary(db)[0];
  assert.notEqual(current.revision, old.revision);
  assert.equal(forgetTagSaveJob(db, current).removed, true);
});

test('a recovery record can be forgotten after both its file and catalog entry were deleted', async () => {
  const { forgetTagSaveJob } = await import('../src/main/tagSaveJournal.js');
  const file = await track('deleted-on-purpose');
  createTagSaveJournal(db).begin(file, { title: 'No longer needed' });
  const record = pendingTagSaveSummary(db)[0];
  fs.unlinkSync(file.id);
  db.prepare('DELETE FROM "audio-tracks" WHERE track_id=?').run(file.track_id);
  const result = forgetTagSaveJob(db, record);
  assert.equal(result.removed, true);
  assert.deepEqual(result.pending, []);
  assert.equal(saved(file.track_id), undefined);
  assert.equal(fs.existsSync(file.id), false);
});

process.on('exit', () => {
  closeDB();
  hooks.deregister();
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
});
