import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { createScanCoordinator } from '../src/main/scanCoordinator.js';

function fixture() {
  const coordinate = createScanCoordinator();
  const workers = [];
  const createWorker = ({ workerData }) => {
    const worker = new EventEmitter();
    worker.workerData = workerData;
    worker.postMessage = () => {};
    worker.terminate = async () => {
      worker.emit('exit', 1);
    };
    workers.push(worker);
    return worker;
  };
  const run = (options = {}) =>
    coordinate({ kind: 'files', createWorker, workerData: 'catalog.db', ...options });
  return { workers, run };
}
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
const complete = (worker, result = { new: 1 }) => {
  worker.emit('message', { result });
  worker.emit('exit', 0);
};

test('scheduled and manual requests share a scan until exit and notify each window once', async () => {
  const { workers, run } = fixture();
  const first = run(); // Scheduler starts without a window.
  const target = receiver();
  const other = receiver();
  assert.equal(run({ target }), first);
  assert.equal(run({ target }), first);
  assert.equal(run({ target: other }), first);
  assert.equal(workers.length, 1);
  workers[0].emit('message', { result: { new: 3 } });
  assert.equal(run({ target }), first, 'A result message released a worker before exit');
  assert.equal(workers.length, 1);
  workers[0].emit('exit', 0);
  assert.deepEqual(await first, { new: 3 });
  assert.deepEqual(target.messages, [['update-complete', 'files', { new: 3 }]]);
  assert.deepEqual(other.messages, target.messages);
  const next = run();
  assert.equal(workers.length, 2);
  complete(workers[1]);
  await next;
});

test('different scan kinds and catalogs remain independent', async () => {
  const { workers, run } = fixture();
  const requests = [run(), run({ kind: 'folders' }), run({ workerData: 'another.db' })];
  assert.equal(workers.length, 3);
  workers.forEach((worker) => complete(worker));
  await Promise.all(requests);
});

test('failure releases ownership only after exit and a later request can retry', async () => {
  for (const fail of [
    (worker) => worker.emit('message', { error: 'Drive unavailable' }),
    (worker) => worker.emit('error', new Error('Cannot open catalog')),
    (worker) => worker.emit('message', { result: 'invalid' }),
    () => {}
  ]) {
    const { workers, run } = fixture();
    const target = receiver();
    const request = run({ target });
    const rejected = assert.rejects(request);
    fail(workers[0]);
    assert.equal(run({ target }), request);
    workers[0].emit('exit', 1);
    await rejected;
    assert.equal(target.messages.length, 1);
    assert.equal(target.messages[0][0], 'update-error');
    const retry = run({ target });
    complete(workers[1]);
    await retry;
    assert.equal(target.messages.length, 2);
  }
});

test('creation and postMessage failures cannot leave a scan permanently busy', async () => {
  const { workers, run } = fixture();
  await assert.rejects(
    run({
      createWorker: () => {
        throw new Error('spawn failed');
      }
    }),
    /spawn failed/
  );
  const failed = run({
    createWorker: () => {
      const worker = new EventEmitter();
      worker.postMessage = () => {
        throw new Error('post failed');
      };
      worker.terminate = async () => {
        worker.emit('exit', 1);
      };
      return worker;
    }
  });
  assert.equal(run(), failed, 'An unterminated worker released ownership');
  await assert.rejects(failed, /post failed/);
  const retry = run();
  complete(workers[0]);
  await retry;
});

test('closed windows are skipped and file summaries retain their UI shape', async () => {
  const { workers, run } = fixture();
  const closed = receiver();
  const live = receiver();
  const request = run({ target: closed, formatResult: (result) => ({ new: result.new.length }) });
  run({ target: live });
  closed.closed = true;
  complete(workers[0], { new: ['one', 'two'] });
  await request;
  assert.deepEqual(closed.messages, []);
  assert.deepEqual(live.messages, [['update-complete', 'files', { new: 2 }]]);
});

test('committed changes refresh views once for shared scheduled/manual scans, and no-op scans do not', async () => {
  const changes = [];
  const coordinate = createScanCoordinator({ onChange: (...args) => changes.push(args) });
  const worker = new EventEmitter();
  worker.postMessage = () => {};
  const options = { kind: 'files', createWorker: () => worker, workerData: 'catalog.db' };
  const first = coordinate(options);
  assert.equal(coordinate({ ...options, target: receiver() }), first);
  complete(worker, { new: ['file'], nochange: false });
  await first;
  assert.equal(changes.length, 1);
  const nextWorker = new EventEmitter();
  nextWorker.postMessage = () => {};
  const next = coordinate({ ...options, createWorker: () => nextWorker });
  complete(nextWorker, { new: [], nochange: true });
  await next;
  assert.equal(changes.length, 1);
});
