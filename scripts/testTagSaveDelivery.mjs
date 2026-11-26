import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { createTagSaveQueue } from '../src/main/tagSaveDelivery.js';
const flush = () => new Promise((resolve) => setImmediate(resolve));
const target = () => ({
  messages: [],
  isDestroyed: () => false,
  send(...args) {
    this.messages.push(args);
  }
});
const worker = () => Object.assign(new EventEmitter(), { postMessage() {} });

test('saves and recovery serialize until exit, not just until the first message', async () => {
  const workers = [],
    changes = [];
  const queue = createTagSaveQueue({
    createWorker: () => {
      const w = worker();
      workers.push(w);
      return w;
    },
    onChange: (value) => changes.push(value)
  });
  const firstTarget = target(),
    secondTarget = target();
  const first = queue({ workerPath: 'one.db', data: [], target: firstTarget });
  const second = queue({ workerPath: 'one.db', mode: 'recover', target: secondTarget });
  await flush();
  assert.equal(workers.length, 1);
  workers[0].emit('message', { status: 'success', res: { files: [{ track_id: 'one' }] } });
  await flush();
  assert.equal(workers.length, 1);
  workers[0].emit('exit', 0);
  await first;
  await flush();
  assert.equal(workers.length, 2);
  workers[1].emit('message', { status: 'failed', res: { files: [] } });
  workers[1].emit('exit', 0);
  await second;
  assert.equal(firstTarget.messages.length, 2);
  assert.equal(secondTarget.messages.length, 2);
  assert.equal(changes.length, 1);
});

test('errors, missing results and invalid messages each terminate exactly once and release the queue', async () => {
  for (const trigger of [
    (w) => {
      w.emit('error', new Error('Failed worker'));
      w.emit('exit', 1);
    },
    (w) => w.emit('exit', 0),
    (w) => {
      w.emit('message', {});
      w.emit('exit', 0);
    }
  ]) {
    const w = worker(),
      receiver = target();
    const queue = createTagSaveQueue({ createWorker: () => w });
    const result = queue({ target: receiver });
    await flush();
    trigger(w);
    assert.equal((await result).status, 'error');
    w.emit('exit', 1);
    assert.equal(receiver.messages.length, 2);
  }
});

test('spawn errors and closed editors do not hang or redirect save results', async () => {
  const receiver = target();
  const failed = createTagSaveQueue({
    createWorker: () => {
      throw new Error('Cannot spawn');
    }
  });
  assert.equal((await failed({ target: receiver })).status, 'error');
  const w = worker();
  const closed = target();
  closed.isDestroyed = () => true;
  const queue = createTagSaveQueue({ createWorker: () => w });
  const promise = queue({ target: closed });
  await flush();
  w.emit('message', { status: 'success' });
  w.emit('exit', 0);
  assert.equal((await promise).status, 'success');
  assert.equal(closed.messages.length, 0);
});
