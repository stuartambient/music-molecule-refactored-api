function describeFailure(error) {
  const descriptions = {
    1: 'Playback was interrupted.',
    2: 'The player could not read this track. Check that its music folder is available.',
    3: 'The player could not decode this track.',
    4: 'The player could not load this track. It may be unavailable or unsupported.'
  };
  return {
    message: descriptions[error?.code] || 'The player could not start this track.',
    detail: error?.message || '',
    code: error?.code
  };
}

export function createPlaybackSession(audio, source, callbacks, { startTime = 0 } = {}) {
  let disposed = false;
  let failed = false;
  let wantsPlayback = false;
  let playPending = false;
  let playAttempt = 0;
  let restoring = Number.isFinite(startTime) && startTime > 0;
  let metadataReady = false;
  let positionReady = false;

  const fail = (error) => {
    if (disposed || failed) return;
    failed = true;
    audio.pause();
    callbacks.onError(describeFailure(error));
  };

  const play = () => {
    wantsPlayback = true;
    if (disposed || failed || playPending || restoring) return;
    playPending = true;
    const attempt = ++playAttempt;
    try {
      Promise.resolve(audio.play())
        .catch((error) => {
          if (wantsPlayback && attempt === playAttempt) fail(error);
        })
        .finally(() => {
          if (attempt === playAttempt) playPending = false;
        });
    } catch (error) {
      playPending = false;
      fail(error);
    }
  };

  const listeners = {
    error: () => {
      if (audio.error) fail(audio.error);
    },
    loadedmetadata: () => {
      if (disposed || failed) return;
      metadataReady = true;
      const wasRestoring = restoring;
      if (restoring) {
        // If the file was replaced with a shorter version, start from zero.
        const target =
          Number.isFinite(audio.duration) && startTime >= audio.duration ? 0 : startTime;
        try {
          audio.currentTime = target;
          restoring = audio.seeking;
        } catch (error) {
          fail(error);
          return;
        }
      }
      positionReady = !restoring;
      callbacks.onMetadata(audio);
      if (wasRestoring && !restoring && wantsPlayback) play();
    },
    ended: () => {
      if (!failed) callbacks.onEnded();
    },
    seeking: () => callbacks.onSeeking(true),
    seeked: () => {
      if (disposed || failed) return;
      const wasRestoring = restoring;
      restoring = false;
      positionReady = metadataReady;
      callbacks.onSeeking(false);
      if (wasRestoring && wantsPlayback) play();
    },
    volumechange: () => callbacks.onVolume(audio.volume)
  };

  audio.pause();
  for (const [event, listener] of Object.entries(listeners)) {
    audio.addEventListener(event, listener);
  }
  try {
    audio.src = source;
    audio.load();
  } catch (error) {
    fail(error);
  }

  return {
    play,
    pause() {
      wantsPlayback = false;
      playAttempt++;
      playPending = false;
      audio.pause();
    },
    getPosition() {
      if (disposed || !positionReady || !Number.isFinite(audio.currentTime)) return undefined;
      return audio.ended || (Number.isFinite(audio.duration) && audio.currentTime >= audio.duration)
        ? 0
        : Math.max(0, audio.currentTime);
    },
    isCurrent() {
      return !disposed;
    },
    dispose() {
      disposed = true;
      wantsPlayback = false;
      for (const [event, listener] of Object.entries(listeners)) {
        audio.removeEventListener(event, listener);
      }
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
  };
}
