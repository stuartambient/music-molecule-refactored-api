export function runUpdateWorker(createWorker, workerData, target, kind, errorKind) {
  let finished = false;
  const finish = (error, result) => {
    if (finished) return;
    finished = true;
    if (!target || target.isDestroyed()) return;
    if (error) target.send('update-error', errorKind, { result: error.message || String(error) });
    else target.send('update-complete', kind, result);
  };
  try {
    const worker = createWorker({ workerData });
    worker.on('message', (message) => {
      if (message && Object.hasOwn(message, 'error'))
        finish(new Error(message.error || 'The update worker reported an error.'));
      else if (message?.result && typeof message.result === 'object') finish(null, message.result);
      else
        finish(
          new Error(
            typeof message?.result === 'string'
              ? message.result
              : 'The update worker returned an invalid result.'
          )
        );
    });
    worker.on('error', (error) => finish(error));
    worker.on('exit', (code) =>
      finish(new Error(`The update worker stopped without a result (exit ${code}).`))
    );
    worker.postMessage('');
  } catch (error) {
    finish(error);
  }
}
