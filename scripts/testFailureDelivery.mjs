import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { test } from 'node:test';
import { runUpdateWorker } from '../src/main/updateWorkerDelivery.js';
import { createCoverDownloads } from '../src/main/coverDownloads.js';

const receiver = () => ({
  messages: [],
  closed: false,
  isDestroyed() {
    return this.closed;
  },
  send(...args) {
    this.messages.push(args);
  }
});
function update() {
  const worker = new EventEmitter();
  worker.postMessage = () => {};
  const target = receiver();
  runUpdateWorker(() => worker, 'active.db', target, 'metadata', 'meta-error');
  return { worker, target };
}
test('a successful worker result produces exactly one completion', () => {
  const { worker, target } = update();
  worker.emit('message', { result: { modified: 2 } });
  worker.emit('exit', 0);
  assert.deepEqual(target.messages, [['update-complete', 'metadata', { modified: 2 }]]);
});
test('an error message followed by a normal exit is failure, never success', () => {
  const { worker, target } = update();
  worker.emit('message', { error: 'Drive unavailable' });
  worker.emit('exit', 0);
  assert.deepEqual(target.messages, [
    ['update-error', 'meta-error', { result: 'Drive unavailable' }]
  ]);
});
test('metadata database failure forwards its detailed report exactly once', () => {
  const { worker, target } = update();
  const report = {
    modified: 0,
    failed: 1,
    details: { missing: [], bad: [{ id: 'file.flac', error: 'Database locked' }], modified: [] }
  };
  worker.emit('message', { error: 'Database locked', report });
  worker.emit('exit', 0);
  assert.deepEqual(target.messages, [
    ['update-error', 'meta-error', { result: 'Database locked', report }]
  ]);
});

test('worker errors and exits cannot produce duplicate terminal notifications', () => {
  const { worker, target } = update();
  worker.emit('error', Error('Cannot open catalog'));
  worker.emit('exit', 1);
  assert.equal(target.messages.length, 1);
  assert.match(target.messages[0][2].result, /Cannot open/);
});
test('exit without a result, invalid results, and creation errors all reach the renderer', () => {
  for (const trigger of [
    (w) => w.emit('exit', 0),
    (w) => w.emit('message', { result: 'SQL failed' }),
    (w) => w.emit('message', { error: undefined })
  ]) {
    const { worker, target } = update();
    trigger(worker);
    assert.equal(target.messages[0][0], 'update-error');
  }
  const target = receiver();
  runUpdateWorker(
    () => {
      throw Error('spawn failed');
    },
    'db',
    target,
    'covers',
    'covers-error'
  );
  assert.equal(target.messages[0][2].result, 'spawn failed');
});
test('closing the receiving window does not throw or redirect the result', () => {
  const { worker, target } = update();
  target.closed = true;
  worker.emit('message', { error: 'failed' });
  worker.emit('exit', 1);
  assert.deepEqual(target.messages, []);
});

function downloads(overrides = {}) {
  const sender = receiver();
  let calls = 0;
  const editor = {
    closed: false,
    messages: [],
    isDestroyed() {
      return this.closed;
    },
    webContents: {
      send(...args) {
        editor.messages.push(args);
      }
    }
  };
  const service = createCoverDownloads({
    dialog: { showSaveDialog: async () => ({ canceled: false, filePath: 'cover.jpg' }) },
    downloadFile: async () => {
      calls++;
      return true;
    },
    getEditor: () => editor,
    temporaryDirectory: () => os.tmpdir(),
    ...overrides
  });
  return { service, sender, editor, count: () => calls };
}
test('cancelling the save dialog never starts a download or reports a failure', async () => {
  const { service, sender, count } = downloads({
    dialog: { showSaveDialog: async () => ({ canceled: true }) }
  });
  assert.equal(
    (await service.save(sender, 'https://example.test/cover.jpg', '')).status,
    'cancelled'
  );
  assert.equal(count(), 0);
  assert.deepEqual(sender.messages, [['download-completed', 'download cancelled']]);
});
test('dialog, URL, and download errors return a visible failure result', async () => {
  for (const overrides of [
    {
      dialog: {
        showSaveDialog: async () => {
          throw Error('dialog failed');
        }
      }
    },
    {
      downloadFile: async () => {
        throw Error('network failed');
      }
    },
    { downloadFile: async () => false }
  ]) {
    const { service, sender } = downloads(overrides);
    assert.equal(
      (await service.save(sender, 'https://example.test/cover.jpg', '')).status,
      'error'
    );
    assert.equal(sender.messages[0][0], 'download-failed');
  }
  const { service, sender, count } = downloads();
  assert.equal((await service.save(sender, 'invalid URL', '')).status, 'error');
  assert.equal(count(), 0);
});
test('a failed download can be retried successfully through the same service', async () => {
  let attempt = 0;
  const { service, sender } = downloads({
    downloadFile: async () => {
      if (++attempt === 1) throw Error('offline');
      return true;
    }
  });
  assert.equal((await service.save(sender, 'https://example.test/a.jpg', '')).status, 'error');
  assert.equal((await service.save(sender, 'https://example.test/a.jpg', '')).status, 'success');
  assert.equal(sender.messages.length, 2);
});
test('a window closed during its save dialog does not start a download', async () => {
  const fixture = downloads({
    dialog: {
      showSaveDialog: async () => {
        fixture.sender.closed = true;
        return { canceled: false, filePath: 'cover.jpg' };
      }
    }
  });
  assert.equal(
    (await fixture.service.save(fixture.sender, 'https://example.test/a.jpg', '')).status,
    'cancelled'
  );
  assert.equal(fixture.count(), 0);
  assert.equal(fixture.sender.messages.length, 0);
});
test('tag artwork staging reports failure if its editor is closed', async () => {
  const { service, sender, editor, count } = downloads();
  editor.closed = true;
  assert.equal(
    (await service.stage(sender, 'https://example.test/a.jpg', 'track.mp3')).status,
    'error'
  );
  assert.equal(count(), 0);
});
test('staged artwork reaches its original editor, with a terminal success for the requester', async () => {
  const { service, sender, editor } = downloads();
  assert.equal(
    (await service.stage(sender, 'https://example.test/a.jpg', ['track.mp3'])).status,
    'success'
  );
  assert.equal(editor.messages[0][0], 'for-submit-form');
  assert.deepEqual(editor.messages[0][1].filePath, ['track.mp3']);
  assert.equal(sender.messages[0][1], 'download successful');
});
test('closing the editor during download removes an undelivered temporary image', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cover-failure-'));
  let saved;
  const fixture = downloads({
    temporaryDirectory: () => root,
    downloadFile: async (_, file) => {
      saved = file;
      await fs.writeFile(file, 'image');
      fixture.editor.closed = true;
      return true;
    }
  });
  try {
    assert.equal(
      (await fixture.service.stage(fixture.sender, 'https://example.test/a.jpg', 'track.mp3'))
        .status,
      'error'
    );
    await assert.rejects(fs.access(saved));
    assert.equal(fixture.editor.messages.length, 0);
  } finally {
    await fs.rmdir(root);
  }
});
