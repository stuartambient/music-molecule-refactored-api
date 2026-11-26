// Keep ownership until worker exit, even if a result or error arrives first.
export function createTagSaveQueue({ createWorker, onChange = () => {} }) {
  let queue = Promise.resolve();
  return ({ workerPath, data = [], mode = 'save', logDir, target }) => {
    const run = () =>
      new Promise((resolve) => {
        const send = (value) => {
          if (target && !target.isDestroyed()) target.send('updated-tags', value);
        };
        send({ status: 'starting' });
        let finished = false,
          result,
          failure;
        const finish = (value) => {
          if (finished) return;
          finished = true;
          send(value);
          if (value.res?.files?.length) onChange(value);
          resolve(value);
        };
        const fail = (error) =>
          finish({
            status: 'error',
            error: error.message || String(error),
            affected: data.map(({ track_id, id }) => ({ track_id, id }))
          });
        let worker;
        try {
          worker = createWorker({ workerData: { workerPath, data, mode, logDir } });
          worker.on('message', (message) => {
            if (['success', 'failed', 'partial_status', 'error'].includes(message?.status))
              result = message;
            else failure = new Error('Tag save worker returned an invalid result.');
          });
          worker.once('error', (error) => {
            failure = error;
          });
          worker.once('exit', (code) => {
            if (failure) fail(failure);
            else if (code === 0 && result) finish(result);
            else
              fail(
                new Error(
                  `Tag save worker stopped without a confirmed result (exit ${code}). Unfinished saves can be rechecked in the tag editor.`
                )
              );
          });
          worker.postMessage('');
        } catch (error) {
          if (worker?.terminate)
            Promise.resolve(worker.terminate()).then(
              () => fail(error),
              () => fail(error)
            );
          else fail(error);
        }
      });
    const result = queue.then(run, run);
    queue = result.catch(() => {});
    return result;
  };
}
