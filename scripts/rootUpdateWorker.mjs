// Test fixture: pause the actual root-update transaction before insertion.
import { parentPort, workerData } from 'node:worker_threads';
import { createRequire, registerHooks } from 'node:module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const db = new Database(workerData);
globalThis.rootUpdateDb = db;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === './connection' && context.parentURL.endsWith('/sql.js'))
      return {
        url: 'data:text/javascript,export default globalThis.rootUpdateDb',
        shortCircuit: true
      };
    return next(specifier, context);
  }
});
const { updateRoots } = await import('../src/main/sql.js');
hooks.deregister();
db.function('pause_root_write', () => {
  parentPort.postMessage('inside-transaction');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
});
try {
  updateRoots(['D:/Replacement']);
} finally {
  db.close();
}
