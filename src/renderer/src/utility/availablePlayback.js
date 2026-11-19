import { createPlaybackSession } from './playbackSession.js';

export function createAvailablePlayback(audio, source, check, callbacks) {
  let disposed = false;
  let session;
  let wantsPlayback = false;
  audio.pause();

  const reportError = async (error) => {
    if (error.reason) {
      if (!disposed) callbacks.onError(error);
      return;
    }
    // A drive can disappear after the initial check. Keep decoder errors distinct.
    let availability;
    try {
      availability = await check();
    } catch {
      /* Keep the player's original error. */
    }
    if (!disposed) callbacks.onError(availability?.available === false ? availability : error);
  };
  Promise.resolve()
    .then(check)
    .then((availability) => {
      if (disposed) return;
      if (!availability.available) {
        callbacks.onError(availability);
        return;
      }
      callbacks.onAvailable?.();
      session = createPlaybackSession(audio, source, { ...callbacks, onError: reportError });
      if (wantsPlayback) session.play();
    })
    .catch(() => {
      if (!disposed)
        callbacks.onError({
          message: 'The track’s availability could not be checked. Check its drive, then Retry.'
        });
    });

  return {
    play() {
      wantsPlayback = true;
      session?.play();
    },
    pause() {
      wantsPlayback = false;
      session?.pause();
    },
    isCurrent() {
      return !disposed;
    },
    dispose() {
      disposed = true;
      wantsPlayback = false;
      session?.dispose();
    }
  };
}
