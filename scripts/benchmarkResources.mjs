// Run with Electron in Node mode and --expose-gc; see the resource-soak report for options.
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath, URL } from 'node:url';

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'music-resource-soak-'));
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
        .replace(
          'export async function getTagInfo(file) {',
          `export async function getTagInfo(file) { if (file.endsWith('secondary-failure.mp3')) throw new Error('Injected secondary metadata-reader failure');`
        )
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

import { Buffer } from 'node:buffer';
import { performance } from 'node:perf_hooks';
import { isBuiltin } from 'node:module';
import { Worker } from 'node:worker_threads';
import { build } from 'esbuild';
import { trackFileResources, windowsProcessSampler, resourceSample } from './resourceSampler.mjs';

const args = process.argv.slice(2);
const argument = (name, fallback) => {
  const at = args.indexOf(name);
  return at < 0 ? fallback : args[at + 1];
};
const number = (name, fallback, max = 10000) => {
  const value = Number(argument(name, fallback));
  if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`Invalid ${name}`);
  return value;
};
const config = {
  batches: number('--batches', 30, 1000),
  batchSize: number('--batch-size', 400),
  saveBatchSize: number('--save-batch-size', 40),
  workerBatches: number('--worker-batches', 30, 1000),
  workerBatchSize: number('--worker-batch-size', 4),
  warmup: number('--warmup-batches', 3, 50),
  artworkKiB: number('--artwork-kib', 256, 2048)
};
const output = path.resolve(argument('--output', 'docs/benchmarks/resource-soak-2026-11-26.json'));
if (typeof globalThis.gc !== 'function')
  throw new Error('Run with Electron in Node mode and --expose-gc.');
const log = console.log.bind(console),
  fail = console.error.bind(console);
const suppressed = { log: 0, warn: 0, error: 0 };
const report = {
  generatedAt: new Date().toISOString(),
  status: 'running',
  config,
  platform: `${os.platform()} ${os.release()} ${os.arch()}`,
  cpu: os.cpus()[0]?.model,
  runtime: { node: process.versions.node, electron: process.versions.electron },
  phases: [],
  limitations: [
    'Synthetic short MP3/FLAC files exercise tag I/O, not decoding or full-sized audio payloads.',
    'Same fixture paths are reused. This is warm-cache stress, not a full real-library or network-drive scan.',
    'No renderer or playback engine is running. GUI memory and decoded audio buffers are outside this test.',
    'Node file accounting covers public fs open/close APIs in the parent isolate. SQLite and worker internals are checked through the Windows process handle count.',
    'V8 garbage collection runs between samples to distinguish retained memory from temporary allocations. RSS/private memory can remain reserved by allocators.'
  ]
};
const persist = () => {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
};
let tracker, monitor, closeDB;
try {
  const { File, Picture, TagTypes, MpegAudioFileSettings } = await import('node-taglib-sharp');
  tracker = trackFileResources(File);
  monitor = windowsProcessSampler();
  const { initializeCatalog } = await import('../src/main/catalogStartup.js');
  const connection = await import('../src/main/connection.js');
  closeDB = connection.closeDB;
  const { parseMeta, insertFiles, updateFiles } = await import('../src/main/utility/utils.js');
  const { default: updateTags } = await import('../src/main/updateTags.js');
  const { expectedTagValues, verifyTagValues } = await import('../src/main/tagVerification.js');
  const { runTagSaveBatch } = await import('../src/main/tagSaveWorkflow.js');
  const { pendingTagSaveSummary } = await import('../src/main/tagSaveJournal.js');
  const { getTrackCover } = await import('../src/main/trackCover.js');
  const { default: searchCover } = await import('../src/main/folderImageCheck.js');
  const { createTagSaveQueue } = await import('../src/main/tagSaveDelivery.js');
  assert.equal(initializeCatalog().ok, true);
  const db = connection.getDB();
  db.prepare('INSERT INTO roots(root) VALUES (?)').run(temporaryRoot.replaceAll('\\', '/'));
  report.runtime.sqlite = db.prepare('SELECT sqlite_version() AS v').get().v;
  const mp3 =
    '/+MYxAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxDsAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxHYAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';
  const flac =
    'ZkxhQwAAACIBkAGQAAAAAAM1AfQA8AAAAAAAAAAAAAAAAAAAAAAAAAAAhAAALAwAAABMYXZmNjMuNC4xMDABAAAAFAAAAGVuY29kZXI9TGF2ZjYzLjQuMTAw//h0CAABjyQAAAB9Xw==';

  // Add a valid PNG text chunk to make a realistically sized embedded image without external tools.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    'base64'
  );
  const payload = Buffer.concat([
    Buffer.from('Comment\0'),
    Buffer.alloc(config.artworkKiB * 1024, 97)
  ]);
  const type = Buffer.from('tEXt'),
    chunk = Buffer.alloc(payload.length + 12);
  chunk.writeUInt32BE(payload.length);
  type.copy(chunk, 4);
  payload.copy(chunk, 8);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([type, payload])) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
  const artwork = Buffer.concat([png.subarray(0, -12), chunk, png.subarray(-12)]);
  const image = path.join(temporaryRoot, 'source-art.png');
  fs.writeFileSync(image, artwork);
  MpegAudioFileSettings.defaultTagTypes = TagTypes.Id3v2;
  const filenames = [];
  for (const mode of ['embedded', 'folder', 'none']) {
    const directory = path.join(temporaryRoot, mode);
    fs.mkdirSync(directory);
    if (mode === 'folder') fs.writeFileSync(path.join(directory, 'cover.png'), artwork);
    for (const extension of ['mp3', 'flac'])
      for (let i = 0; i < 10; i++) {
        const filename = path.join(directory, `${i}.${extension}`);
        fs.writeFileSync(filename, Buffer.from(extension === 'mp3' ? mp3 : flac, 'base64'));
        if (mode === 'embedded') {
          let file;
          try {
            file = File.createFromPath(filename);
            file.tag.pictures = [Picture.fromPath(image)];
            file.save();
          } finally {
            file?.dispose();
          }
        }
        filenames.push(filename.replaceAll('\\', '/'));
      }
  }
  const initial = await parseMeta(filenames, 'new', () => temporaryRoot);
  assert.ok(initial.every((row) => !row.error));
  assert.equal(insertFiles(db, initial).success, true);
  db.exec('UPDATE "audio-tracks" SET "like"=1');
  const tracks = initial.map((row) => ({ id: row.audiotrack, track_id: row.track_id }));
  const broken = path.join(temporaryRoot, 'invalid.mp3'),
    missing = path.join(temporaryRoot, 'missing.mp3'),
    secondary = path.join(temporaryRoot, 'secondary-failure.mp3');
  fs.writeFileSync(broken, 'invalid MPEG fixture');
  fs.writeFileSync(secondary, Buffer.from(mp3, 'base64'));
  const badTracks = [broken, missing, secondary].map((id, index) => ({
    id,
    track_id: `failed-${index}`
  }));
  report.fixture = {
    healthyTracks: tracks.length,
    formats: ['mp3', 'flac'],
    artworkBytes: artwork.length,
    failureModes: [
      'unreadable audio header',
      'missing path',
      'secondary-reader rejection after TagLib opens the file'
    ]
  };
  const workerFile = path.join(temporaryRoot, 'tag-save-worker.cjs');
  await build({
    entryPoints: [path.join(sourceRoot, 'updateTagsWorker.js')],
    outfile: workerFile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    plugins: [
      {
        name: 'external-dependencies',
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
  const queue = createTagSaveQueue({
    createWorker: (options) => {
      const worker = new Worker(workerFile, {
        ...options,
        execArgv: [],
        stdout: true,
        stderr: true
      });
      worker.stdout.resume();
      worker.stderr.resume();
      return worker;
    }
  });
  console.log = () => {
    suppressed.log++;
  };
  console.warn = () => {
    suppressed.warn++;
  };
  console.error = () => {
    suppressed.error++;
  };
  const batchTracks = (batch, count) =>
    Array.from({ length: count }, (_, i) => tracks[(Math.abs(batch) * count + i) % tracks.length]);
  const saveOptions = {
    db,
    expect: expectedTagValues,
    write: (edit) => updateTags(db, [edit]),
    verify: verifyTagValues,
    parse: (files) => parseMeta(files, 'mod', () => temporaryRoot),
    save: (files) => updateFiles(db, files),
    inspect: (file) => fs.promises.stat(file)
  };
  const operations = {
    metadata: async (batch, count) => {
      const parsed = await parseMeta(batchTracks(batch, count), 'mod', () => temporaryRoot);
      assert.ok(parsed.every((row) => !row.error));
      assert.equal(updateFiles(db, parsed).success, true);
    },
    artwork: async (batch, count) => {
      for (const track of batchTracks(batch, count)) {
        const cover = await getTrackCover(track.id, { getRoot: () => [], searchCover });
        if (/[\\/]none[\\/]/.test(track.id)) assert.equal(cover, 0);
        else assert.equal(cover.length, artwork.length);
      }
    },
    saves: async (batch, count) => {
      const edits = batchTracks(batch, count).map((track, i) => ({
        ...track,
        updates: { title: `Resource test ${batch}-${i}` }
      }));
      const result = await runTagSaveBatch({ ...saveOptions, edits });
      assert.equal(result.status, 'success');
      assert.equal(result.pending.length, 0);
    },
    failures: async (batch, count) => {
      const input = Array.from(
        { length: count },
        (_, i) => badTracks[(Math.abs(batch) * count + i) % badTracks.length]
      );
      const result = await parseMeta(input, 'mod', () => temporaryRoot);
      assert.ok(result.every((row) => row.error));
    },
    workers: async (batch, count) => {
      const data = batchTracks(batch, count).map((track, i) => ({
        ...track,
        updates: { title: `Worker test ${batch}-${i}` }
      }));
      const result = await queue({ workerPath: connection.dbPath, data });
      assert.equal(result.status, 'success');
      assert.equal(result.pending.length, 0);
    }
  };
  const average = (samples, getter) =>
    samples.reduce((sum, sample) => sum + getter(sample), 0) / samples.length;
  report.baseline = await resourceSample(tracker, monitor);
  for (const name of ['metadata', 'artwork', 'saves', 'failures', 'workers']) {
    const count =
      name === 'saves'
        ? config.saveBatchSize
        : name === 'workers'
          ? config.workerBatchSize
          : config.batchSize;
    const batches = name === 'workers' ? config.workerBatches : config.batches;
    log(
      `Starting ${name}: ${batches} measured batches x ${count}, plus ${config.warmup} warm-up batches`
    );
    for (let i = 0; i < config.warmup; i++) await operations[name](-i - 1, count);
    const phase = {
      name,
      batches,
      perBatch: count,
      operations: batches * count,
      warmupOperations: config.warmup * count,
      samples: []
    };
    report.phases.push(phase);
    phase.start = await resourceSample(tracker, monitor);
    for (let i = 0; i < batches; i++) {
      const start = performance.now();
      await operations[name](i, count);
      const elapsedMs = performance.now() - start;
      const sample = {
        batch: i + 1,
        operations: (i + 1) * count,
        elapsedMs,
        ...(await resourceSample(tracker, monitor))
      };
      phase.samples.push(sample);
      if ((i + 1) % 5 === 0 || i === batches - 1)
        log(
          `${name} ${i + 1}/${batches}: RSS ${(sample.afterGc.rss / 1048576).toFixed(1)} MiB; handles ${sample.windows?.handleCount}; open files ${sample.files.openFileCount}; TagLib objects ${sample.files.taglibOutstanding}`
        );
    }
    const window = Math.min(5, phase.samples.length),
      first = phase.samples.slice(0, window),
      last = phase.samples.slice(-window);
    phase.summary = {
      firstToLastHeapMiB:
        (average(last, (s) => s.afterGc.heapUsed) - average(first, (s) => s.afterGc.heapUsed)) /
        1048576,
      firstToLastExternalMiB:
        (average(last, (s) => s.afterGc.external) - average(first, (s) => s.afterGc.external)) /
        1048576,
      firstToLastRssMiB:
        (average(last, (s) => s.afterGc.rss) - average(first, (s) => s.afterGc.rss)) / 1048576,
      firstToLastHandles:
        average(last, (s) => s.windows?.handleCount || 0) -
        average(first, (s) => s.windows?.handleCount || 0),
      maxOpenFiles: Math.max(...phase.samples.map((s) => s.files.openFileCount)),
      maxUndisposedTaglib: Math.max(...phase.samples.map((s) => s.files.taglibOutstanding)),
      meanBatchMs: average(phase.samples, (s) => s.elapsedMs)
    };
    persist();
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM "audio-tracks"').get().n, tracks.length);
  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM "audio-tracks" WHERE "like"=1').get().n,
    tracks.length
  );
  assert.equal(pendingTagSaveSummary(db).length, 0);
  report.beforeClose = await resourceSample(tracker, monitor);
  closeDB();
  closeDB = null;
  report.afterClose = await resourceSample(tracker, monitor);
  report.suppressedFixtureLogs = suppressed;
  report.status = report.phases.every(
    (phase) => !phase.summary.maxOpenFiles && !phase.summary.maxUndisposedTaglib
  )
    ? 'completed-no-unclosed-files-detected'
    : 'completed-resource-retention-detected';
  persist();
  log(`Resource report saved: ${output}`);
} catch (error) {
  report.status = 'failed';
  report.error = error.stack || String(error);
  persist();
  fail(error);
  process.exitCode = 1;
} finally {
  closeDB?.();
  tracker?.restore();
  await monitor?.close();
  hooks.deregister();
  assert.equal(path.dirname(temporaryRoot), os.tmpdir());
  assert.ok(path.basename(temporaryRoot).startsWith('music-resource-soak-'));
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
