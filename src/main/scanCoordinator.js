// Share one scan of each kind per catalog, retaining ownership until its worker exits.
export function createScanCoordinator({ onChange = () => {} } = {}) {
  const active = new Map();
  return function runScan({
    kind,
    createWorker,
    workerData,
    target,
    formatResult = (value) => value
  }) {
    const key = JSON.stringify([kind, workerData]);
    const running = active.get(key);
    if (running) {
      if (target) running.targets.add(target);
      return running.promise;
    }
    let resolve, reject;
    const promise = new Promise((done, fail) => {
      resolve = done;
      reject = fail;
    });
    const job = { promise, targets: new Set(target ? [target] : []) };
    active.set(key, job);
    let finished = false;
    const finish = (error, result) => {
      if (finished) return;
      finished = true;
      active.delete(key);
      let formatted;
      if (!error) {
        try {
          formatted = formatResult(result);
        } catch (failure) {
          error = failure;
        }
      }
      if (!error && !result.nochange) {
        try {
          onChange(kind, result);
        } catch (failure) {
          console.error('Could not refresh catalog views:', failure);
        }
      }
      for (const receiver of job.targets) {
        if (receiver.isDestroyed()) continue;
        try {
          if (error) receiver.send('update-error', `${kind}-error`, { result: error.message });
          else receiver.send('update-complete', kind, formatted);
        } catch (failure) {
          console.error('Could not deliver scan result:', failure);
        }
      }
      if (error) reject(error);
      else resolve(result);
    };
    let worker;
    let outcome;
    try {
      worker = createWorker({ workerData });
      worker.on('message', (message) => {
        if (outcome) return;
        if (message && Object.hasOwn(message, 'error')) {
          outcome = { error: new Error(message.error || 'The scan worker reported an error.') };
        } else if (message?.result && typeof message.result === 'object') {
          outcome = { result: message.result };
        } else {
          outcome = { error: new Error('The scan worker returned an invalid result.') };
        }
      });
      worker.on('error', (error) => {
        outcome = { error };
      });
      worker.once('exit', (code) => {
        const error =
          outcome?.error ||
          (code !== 0 || !outcome
            ? new Error(`The scan worker stopped without completing (exit ${code}).`)
            : null);
        finish(error, outcome?.result);
      });
      worker.postMessage('');
    } catch (error) {
      outcome = { error };
      if (worker) {
        // Do not start a replacement while a failed worker can still write.
        Promise.resolve()
          .then(() => worker.terminate())
          .then(
            () => finish(error),
            () => finish(error)
          );
      } else finish(error);
    }
    return promise;
  };
}
