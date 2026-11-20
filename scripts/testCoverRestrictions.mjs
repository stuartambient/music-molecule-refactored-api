import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { gzipSync } from 'node:zlib';
import { test } from 'node:test';
import {
  validateCoverDownloadUrl,
  isPublicAddress,
  createPublicLookup,
  downloadCoverFile
} from '../src/main/coverDownloader.js';
import { readCoverSelection } from '../src/renderer/src/utility/coverSelection.js';

test('cover links permit public HTTP/HTTPS providers but reject local addresses, credentials, and non-web schemes', () => {
  for (const value of [
    'https://cdn.example.com/cover.jpg?size=large',
    'http://images.example.com/image',
    'https://[2606:4700:4700::1111]/a'
  ])
    assert(validateCoverDownloadUrl(value));
  for (const value of [
    'file:///C:/secret',
    'javascript:alert(1)',
    'data:image/png;base64,AA==',
    'https://user:pass@example.com/a',
    'http://localhost/a',
    'http://printer/a',
    'http://127.1/a',
    'http://0x7f000001/a',
    'http://192.168.1.1/a',
    'http://169.254.169.254/a',
    'http://[::1]/a',
    'http://[::ffff:127.0.0.1]/a'
  ])
    assert.throws(() => validateCoverDownloadUrl(value), value);
});
test('reserved/private IPv4 and IPv6 ranges are excluded, including mapped IPv4', () => {
  for (const value of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])
    assert.equal(isPublicAddress(value), true, value);
  for (const value of [
    '0.1.1.1',
    '10.1.1.1',
    '100.64.1.1',
    '127.0.0.1',
    '169.254.1.1',
    '172.16.1.1',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::ffff:192.168.1.1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '2002:c0a8:101::',
    'bad'
  ])
    assert.equal(isPublicAddress(value), false, value);
});
test('connection-time DNS validation rejects local and mixed public/private answers', async () => {
  for (const addresses of [
    [{ address: '127.0.0.1', family: 4 }],
    [
      { address: '8.8.8.8', family: 4 },
      { address: '10.0.0.1', family: 4 }
    ]
  ]) {
    const lookup = createPublicLookup((_host, _options, done) => done(null, addresses));
    await assert.rejects(
      new Promise((resolve, reject) =>
        lookup('images.example.com', { all: true }, (error, result) =>
          error ? reject(error) : resolve(result)
        )
      )
    );
  }
  const lookup = createPublicLookup((_host, _options, done) =>
    done(null, [{ address: '8.8.8.8', family: 4 }])
  );
  assert.deepEqual(
    await new Promise((resolve, reject) =>
      lookup('cdn.example.com', { all: true }, (error, result) =>
        error ? reject(error) : resolve(result)
      )
    ),
    [{ address: '8.8.8.8', family: 4 }]
  );
});
test('selection messages require both the expected iframe and origin', () => {
  const frame = {},
    other = {};
  const event = {
    origin: 'https://covers.musichoarders.xyz',
    source: frame,
    data: { action: 'primary', type: 'pick', bigCoverUrl: 'https://cdn.example.com/a.jpg' }
  };
  assert.equal(readCoverSelection(event, frame), 'https://cdn.example.com/a.jpg');
  assert.equal(readCoverSelection({ ...event, source: other }, frame), null);
  assert.equal(readCoverSelection({ ...event, origin: 'https://other.example.com' }, frame), null);
  assert.equal(readCoverSelection({ ...event, data: 'not JSON' }, frame), null);
  assert.equal(readCoverSelection({ ...event, data: { action: 'other' } }, frame), null);
  assert.throws(() =>
    readCoverSelection({ ...event, data: { ...event.data, bigCoverUrl: 'file:///secret' } }, frame)
  );
});

test('HTTP downloads enforce redirect, content, byte, and time limits without replacing an existing cover on failure', async (suite) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cover-security-'));
  const destination = path.join(root, 'cover.jpg');
  const image = await fs.readFile(
    new URL('../src/renderer/src/assets/noimage.jpg', import.meta.url)
  );
  const server = http.createServer((request, response) => {
    switch (request.url) {
      case '/image':
        response.end(image);
        break;
      case '/redirect':
        response.writeHead(302, { Location: '/image' });
        response.end();
        break;
      case '/local':
        response.writeHead(302, { Location: 'http://127.0.0.1/secret' });
        response.end();
        break;
      case '/credentials':
        response.writeHead(302, { Location: 'http://user:pass@cdn.example.test/image' });
        response.end();
        break;
      case '/loop':
        response.writeHead(302, { Location: '/loop' });
        response.end();
        break;
      case '/large':
        response.end(Buffer.alloc(4096));
        break;
      case '/chunked':
        response.write(image.subarray(0, 50));
        response.end(Buffer.alloc(4096));
        break;
      case '/gzip':
        response.setHeader('Content-Encoding', 'gzip');
        response.end(gzipSync(Buffer.alloc(4096)));
        break;
      case '/svg':
        response.setHeader('Content-Type', 'image/svg+xml');
        response.end('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
        break;
      case '/slow':
        setTimeout(() => response.end(image), 150);
        break;
      default:
        response.end('<html>Not an image</html>');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://cdn.example.test:${server.address().port}`;
  // Test-only mapping of a public-looking fixture hostname to the local server.
  // Production uses the separately tested public-address DNS lookup above.
  const lookup = (_hostname, options, done) =>
    options.all ? done(null, [{ address: '127.0.0.1', family: 4 }]) : done(null, '127.0.0.1', 4);
  const save = (route, options = {}) =>
    downloadCoverFile(base + route, destination, { lookup, ...options });
  try {
    await suite.test('normal images and relative public-host redirects are saved', async () => {
      await save('/image');
      assert.deepEqual(await fs.readFile(destination), image);
      await save('/redirect');
      assert.deepEqual(await fs.readFile(destination), image);
    });
    await suite.test(
      'private redirects, credentials, redirect loops, HTML, and SVG are rejected',
      async () => {
        for (const route of ['/local', '/credentials', '/loop', '/html', '/svg']) {
          await assert.rejects(save(route));
          assert.deepEqual(await fs.readFile(destination), image);
        }
      }
    );
    await suite.test(
      'declared and chunked oversized responses stop at the byte limit',
      async () => {
        for (const route of ['/large', '/chunked', '/gzip'])
          await assert.rejects(save(route, { maxBytes: 1024 }), /limit/);
        assert.deepEqual(await fs.readFile(destination), image);
      }
    );
    await suite.test('slow requests terminate and retain the previous cover', async () => {
      await assert.rejects(save('/slow', { timeoutMs: 30 }), /timed out/);
      assert.deepEqual(await fs.readFile(destination), image);
      assert.deepEqual(await fs.readdir(root), ['cover.jpg']);
    });
    await suite.test('local URLs are rejected before a request starts', async () => {
      await assert.rejects(downloadCoverFile('http://127.0.0.1/image', destination));
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.unlink(destination).catch(() => {});
    await fs.rmdir(root);
  }
});
