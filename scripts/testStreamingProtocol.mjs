import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { setTimeout as delay } from 'node:timers/promises';
import { test, after } from 'node:test';
import {
  createStreamingHandler,
  streamingFilePath,
  audioRange
} from '../src/main/streamingProtocol.js';
import { streamingUrl } from '../src/shared/streamingUrl.js';
const { Request, AbortController } = globalThis;
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'music-streaming-protocol-'));
const bytes = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz');
const files = {};
for (const extension of ['mp3', 'flac', 'm4a', 'ogg', 'wav', 'unknown']) {
  files[extension] = path.join(root, 'sample.' + extension);
  await fs.writeFile(files[extension], bytes);
}
const special = path.join(root, '50% # é literal%2F.flac');
await fs.writeFile(special, bytes);
const empty = path.join(root, 'empty.flac');
await fs.writeFile(empty, '');
const large = path.join(root, 'large.flac');
await fs.writeFile(large, Buffer.alloc(2 * 1024 * 1024, 7));
let live = 0;
const trackedOpen = async (...args) => {
  const file = await fs.open(...args);
  live++;
  file.once('close', () => {
    live--;
  });
  return file;
};
const handler = createStreamingHandler({ open: trackedOpen });
const request = (file = files.flac, options) => new Request(streamingUrl(file, 'test'), options);
const settled = async () => {
  for (let i = 0; live && i < 100; i++) await delay(5);
  assert.equal(live, 0, 'File descriptor left open');
};
after(async () => {
  await settled();
  assert.equal(path.dirname(root), os.tmpdir());
  assert.ok(path.basename(root).startsWith('music-streaming-protocol-'));
  await fs.rm(root, { recursive: true, force: true });
});

test('full response uses audio MIME, exact size, byte ranges and fresh-file caching', async () => {
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/flac');
  assert.equal(response.headers.get('content-length'), String(bytes.length));
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  await settled();
});

test('each recognized extension gets its MIME type; unknown extensions use a binary fallback', async () => {
  for (const [extension, type] of Object.entries({
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    unknown: 'application/octet-stream'
  })) {
    const response = await handler(request(files[extension]));
    assert.equal(response.headers.get('content-type'), type, extension);
    await response.arrayBuffer();
  }
  await settled();
});

test('closed, open-ended, suffix and oversized-end ranges return exact partial bytes', async () => {
  for (const [range, start, end] of [
    ['bytes=2-5', 2, 5],
    ['bytes=30-', 30, 35],
    ['bytes=-4', 32, 35],
    ['bytes=34-999', 34, 35],
    ['bytes=-999', 0, 35],
    ['bytes=0-999999999999999999999999999999', 0, 35]
  ]) {
    const response = await handler(request(files.flac, { headers: { rAnGe: range } }));
    assert.equal(response.status, 206, range);
    assert.equal(response.headers.get('content-range'), `bytes ${start}-${end}/${bytes.length}`);
    assert.equal(response.headers.get('content-length'), String(end - start + 1));
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes.subarray(start, end + 1));
  }
  await settled();
});

test('invalid or unsatisfiable byte ranges produce one empty 416 response and close the file', async () => {
  for (const range of [
    'bytes=36-',
    'bytes=9-2',
    'bytes=-0',
    'bytes=-',
    'bytes=x-4',
    'bytes=1.5-4',
    'bytes=999999999999999999999999-'
  ]) {
    const response = await handler(request(files.flac, { headers: { Range: range } }));
    assert.equal(response.status, 416, range);
    assert.equal(response.headers.get('content-range'), `bytes */${bytes.length}`);
    assert.equal((await response.arrayBuffer()).byteLength, 0);
  }
  await settled();
});

test('unsupported units and multipart ranges are ignored and served as full responses', async () => {
  for (const range of ['items=0-1', 'bytes=0-1,4-5']) {
    const response = await handler(request(files.flac, { headers: { range } }));
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  }
  await settled();
});

test('HEAD ignores ranges and returns headers without reading a response body', async () => {
  const response = await handler(
    request(files.flac, { method: 'HEAD', headers: { Range: 'bytes=0-2' } })
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-length'), String(bytes.length));
  assert.equal((await response.arrayBuffer()).byteLength, 0);
  await settled();
});

test('empty files, directories, absent files and unsupported methods are handled without streams', async () => {
  const zero = await handler(request(empty));
  assert.equal(zero.status, 200);
  assert.equal(await zero.text(), '');
  assert.equal((await handler(request(empty, { headers: { Range: 'bytes=0-' } }))).status, 416);
  assert.equal((await handler(request(root))).status, 404);
  assert.equal((await handler(request(path.join(root, 'missing.flac')))).status, 404);
  const post = await handler(request(files.flac, { method: 'POST' }));
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
  await settled();
});

test('encoded punctuation and Unicode paths round-trip once and are readable', async () => {
  assert.equal(streamingFilePath(streamingUrl(special, 'fresh?token')), special);
  const response = await handler(request(special));
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  await settled();
  assert.equal(streamingFilePath('streaming://i/Music/a%20b.flac?playback=1'), 'I:/Music/a b.flac');
  assert.equal(streamingFilePath('streaming://I:/Music/a.flac'), 'I:/Music/a.flac');
  assert.equal(
    streamingFilePath(streamingUrl('\\\\server\\share\\a.flac')),
    '\\\\server\\share\\a.flac'
  );
});

test('malformed and relative audio URLs cannot open files', async () => {
  let opens = 0;
  const handle = createStreamingHandler({
    open: async () => {
      opens++;
      throw new Error('Must not open');
    }
  });
  for (const url of [
    'https://example.test/a',
    'streaming://local/relative.flac',
    'streaming://local/%',
    'streaming://local/%00bad',
    'streaming://local/..%2Fa.flac'
  ])
    assert.equal((await handle({ url })).status, 400, url);
  assert.equal(opens, 0);
});

test('permission errors are returned before any audio response body', async () => {
  const handle = createStreamingHandler({
    open: async () => {
      throw Object.assign(new Error('Denied'), { code: 'EACCES' });
    }
  });
  const response = await handle(request());
  assert.equal(response.status, 403);
  assert.equal(await response.text(), '');
});

test('body cancellation and request abort release open descriptors', async () => {
  const response = await handler(request(large));
  await response.body.cancel();
  await settled();
  const controller = new AbortController();
  const active = await handler(request(large, { signal: controller.signal }));
  controller.abort();
  await assert.rejects(active.arrayBuffer());
  await settled();
  const stopped = new AbortController();
  stopped.abort();
  assert.equal((await handler(request(large, { signal: stopped.signal }))).status, 408);
  await settled();
});

test('a shortened file fails its existing body instead of returning successful truncated audio', async () => {
  let errors = 0;
  const handle = createStreamingHandler({
    open: async (...args) => {
      const file = await trackedOpen(...args);
      return {
        stat: async () => ({ isFile: () => true, size: bytes.length + 10 }),
        createReadStream: (options) => file.createReadStream(options),
        close: () => file.close()
      };
    },
    onError: () => {
      errors++;
    }
  });
  const response = await handle(request());
  assert.equal(response.status, 200);
  await assert.rejects(response.arrayBuffer(), /changed/);
  await settled();
  await delay(0);
  assert.equal(errors, 1);
});

test('range arithmetic handles huge suffixes and all zero-size cases', () => {
  assert.deepEqual(audioRange('bytes=-99999999999999999999999', 5), { start: 0, end: 4 });
  assert.equal(audioRange('bytes=0-', 0), false);
  assert.equal(audioRange('bytes=-1', 0), false);
});

test('a slow consumer does not preload the entire file into an unbounded web-stream queue', async () => {
  let read = 0;
  const handle = createStreamingHandler({
    open: async (...args) => {
      const file = await trackedOpen(...args);
      return {
        stat: () => file.stat(),
        close: () => file.close(),
        createReadStream(options) {
          const stream = file.createReadStream(options);
          stream.on('data', (chunk) => {
            read += chunk.length;
          });
          return stream;
        }
      };
    }
  });
  const response = await handle(request(large));
  await delay(25);
  assert.ok(read <= 512 * 1024, `Read ahead ${read} bytes for a consumer that has not started`);
  await response.body.cancel();
  await settled();
});
