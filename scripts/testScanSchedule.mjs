import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import cron from 'node-cron';
import { createScanSchedule, scanScheduleExpressions } from '../src/main/scanSchedule.js';
import { createScanCoordinator } from '../src/main/scanCoordinator.js';

function fixture(run = async () => {}) {
  const tasks = [],
    errors = [];
  const scheduler = createScanSchedule({
    cron: {
      validate: cron.validate,
      createTask(expression, callback, options) {
        const task = {
          expression,
          callback,
          options,
          started: false,
          destroyed: false,
          start() {
            this.started = true;
          },
          destroy() {
            this.destroyed = true;
            this.started = false;
          }
        };
        tasks.push(task);
        return task;
      }
    },
    run,
    onError: (error) => errors.push(error)
  });
  return { scheduler, tasks, errors };
}

test('daily and weekday settings produce valid local-time cron expressions', () => {
  assert.deepEqual(scanScheduleExpressions('everyday@00:00'), ['0 0 * * *']);
  assert.deepEqual(scanScheduleExpressions('everyday@23:59'), ['59 23 * * *']);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  days.forEach((day, index) => {
    const expressions = scanScheduleExpressions({ [day]: '09:05' });
    assert.deepEqual(expressions, [`5 9 * * ${index}`]);
    assert.equal(cron.validate(expressions[0]), true);
  });
  assert.deepEqual(scanScheduleExpressions({ Monday: '', Friday: '' }), []);
});

test('daily scans register a recurring task and wait for the scan promise', async () => {
  let finish,
    calls = 0,
    completed = false;
  const { scheduler, tasks } = fixture(() => {
    calls++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  scheduler.replace('everyday@10:30');
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].started, true);
  assert.equal(tasks[0].options.noOverlap, true);
  assert.equal(tasks[0].options.maxExecutions, undefined);
  const first = tasks[0].callback().then(() => {
    completed = true;
  });
  await Promise.resolve();
  assert.equal(completed, false);
  finish();
  await first;
  const second = tasks[0].callback();
  finish();
  await second;
  assert.equal(calls, 2);
  scheduler.close();
});

test('saving replaces old timers and queued obsolete callbacks cannot launch scans', async () => {
  let calls = 0;
  const { scheduler, tasks } = fixture(async () => {
    calls++;
  });
  scheduler.replace({ Monday: '12:00', Friday: '13:00' });
  assert.equal(tasks.length, 2);
  scheduler.replace('everyday@14:00');
  assert.ok(tasks.slice(0, 2).every((task) => task.destroyed));
  await tasks[0].callback();
  await tasks[1].callback();
  assert.equal(calls, 0);
  await tasks[2].callback();
  assert.equal(calls, 1);
  // Re-saving the same schedule does not restart timers.
  scheduler.replace('everyday@14:00');
  assert.equal(tasks.length, 3);
  scheduler.close();
});

test('clearing and quitting cancel jobs; late preference loads cannot revive them', async () => {
  let calls = 0;
  const { scheduler, tasks } = fixture(async () => {
    calls++;
  });
  scheduler.replace({ Sunday: '18:00' });
  scheduler.replace({ Sunday: '', Monday: '' });
  assert.equal(tasks[0].destroyed, true);
  await tasks[0].callback();
  scheduler.replace({ Tuesday: '19:00' });
  scheduler.close();
  scheduler.close();
  await tasks[1].callback();
  scheduler.replace('everyday@20:00');
  assert.equal(tasks.length, 2);
  assert.equal(calls, 0);
  assert.ok(tasks.every((task) => task.destroyed));
});

test('invalid persisted schedules cannot replace a working schedule', () => {
  const { scheduler, tasks } = fixture();
  scheduler.replace('everyday@10:00');
  for (const bad of [
    null,
    [],
    'everyday@24:00',
    'everyday@10:70',
    'weekly@10:00',
    { Funday: '10:00' },
    { Monday: '*/5 * * * *' },
    { Tuesday: null }
  ]) {
    assert.throws(() => scheduler.replace(bad), /Invalid/);
    assert.equal(tasks[0].destroyed, false);
    assert.equal(tasks.length, 1);
  }
  scheduler.close();
});

test('partial task preparation failure cleans up new timers and preserves the old job', () => {
  const old = {
    destroyed: false,
    start() {},
    destroy() {
      this.destroyed = true;
    }
  };
  const prepared = { ...old };
  let calls = 0;
  const scheduler = createScanSchedule({
    cron: {
      validate: cron.validate,
      createTask() {
        calls++;
        if (calls === 3) throw new Error('Cannot create task');
        return calls === 1 ? old : prepared;
      }
    },
    run: async () => {},
    onError: assert.fail
  });
  scheduler.replace('everyday@10:00');
  assert.throws(() => scheduler.replace({ Monday: '10:00', Tuesday: '11:00' }), /Cannot create/);
  assert.equal(prepared.destroyed, true);
  assert.equal(old.destroyed, false);
  scheduler.close();
});

test('a failed execution is reported and later runs still work', async () => {
  let calls = 0;
  const { scheduler, tasks, errors } = fixture(async () => {
    if (++calls === 1) throw new Error('Worker failed');
  });
  scheduler.replace('everyday@12:00');
  await tasks[0].callback();
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /Worker failed/);
  await tasks[0].callback();
  assert.equal(calls, 2);
  scheduler.close();
});

test('real node-cron daily and weekday jobs remain scheduled after repeated executions', async () => {
  for (const value of ['everyday@23:59', { Monday: '23:59', Friday: '22:00' }]) {
    const tasks = [];
    let calls = 0;
    const scheduler = createScanSchedule({
      cron: {
        validate: cron.validate,
        createTask(...args) {
          const task = cron.createTask(...args);
          tasks.push(task);
          return task;
        }
      },
      run: async () => {
        calls++;
      },
      onError: assert.fail
    });
    try {
      scheduler.replace(value);
      for (const task of tasks) {
        await task.execute();
        await task.execute();
        assert.equal(task.getStatus(), 'idle');
        assert.ok(task.getNextRun() instanceof Date);
      }
      assert.equal(calls, tasks.length * 2);
    } finally {
      scheduler.close();
    }
    assert.ok(tasks.every((task) => task.getStatus() === 'destroyed'));
  }
});

test('scheduled/manual work shares workers; changing schedule does not abandon running scans', async () => {
  const workers = [];
  const coordinate = createScanCoordinator();
  const run = (kind) =>
    coordinate({
      kind,
      workerData: 'disposable-catalog',
      createWorker() {
        const worker = new EventEmitter();
        worker.postMessage = () => {};
        workers.push(worker);
        return worker;
      }
    });
  const { scheduler, tasks } = fixture(() => Promise.all([run('folders'), run('files')]));
  scheduler.replace('everyday@12:00');
  const scheduled = tasks[0].callback();
  const manual = run('files');
  scheduler.replace('everyday@13:00');
  const next = tasks[1].callback();
  assert.equal(workers.length, 2);
  workers.forEach((worker) => {
    worker.emit('message', { result: { nochange: true } });
    worker.emit('exit', 0);
  });
  await Promise.all([scheduled, manual, next]);
  scheduler.close();
});
