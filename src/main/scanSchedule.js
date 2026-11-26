const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function scanScheduleExpressions(value = {}) {
  const at = (time, day) => {
    if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
      throw new Error('Invalid scheduled scan time.');
    const [hour, minute] = time.split(':').map(Number);
    return `${minute} ${hour} * * ${day}`;
  };
  if (typeof value === 'string') {
    if (!value.startsWith('everyday@')) throw new Error('Invalid scan schedule.');
    return [at(value.slice(9), '*')];
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid scan schedule.');
  const expressions = [];
  for (const [day, time] of Object.entries(value)) {
    if (!weekdays.includes(day)) throw new Error('Invalid scheduled scan day.');
    if (time !== '') expressions.push(at(time, weekdays.indexOf(day)));
  }
  return expressions.sort();
}

// Own the timers, not the scans: already-running work remains with the scan coordinator.
export function createScanSchedule({ cron, run, onError }) {
  let tasks = [];
  let expressions = [];
  let generation = 0;
  let closed = false;
  return {
    replace(value) {
      if (closed) return [];
      const next = scanScheduleExpressions(value);
      if (!next.every((expression) => cron.validate(expression)))
        throw new Error('Invalid scan schedule expression.');
      if (JSON.stringify(next) === JSON.stringify(expressions)) return [...expressions];
      const nextGeneration = generation + 1;
      const prepared = [];
      try {
        for (const expression of next) {
          prepared.push(
            cron.createTask(
              expression,
              async () => {
                // A callback already queued by an obsolete timer must not launch a scan.
                if (closed || generation !== nextGeneration) return;
                try {
                  await run();
                } catch (error) {
                  onError(error);
                }
              },
              { noOverlap: true }
            )
          );
        }
      } catch (error) {
        for (const task of prepared) task.destroy();
        throw error;
      }
      generation = nextGeneration;
      for (const task of tasks) task.destroy();
      tasks = prepared;
      expressions = next;
      for (const task of tasks) task.start();
      return [...expressions];
    },
    close() {
      closed = true;
      generation++;
      for (const task of tasks) task.destroy();
      tasks = [];
      expressions = [];
    }
  };
}
