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

export function createPlaybackSession(audio, source, callbacks) {
  let disposed = false;
  let failed = false;
  let wantsPlayback = false;
  let playPending = false;
  let playAttempt = 0;

  const fail = (error) => {
    if (disposed || failed) return;
    failed = true;
    audio.pause();
    callbacks.onError(describeFailure(error));
  };

  const play = () => {
    wantsPlayback = true;
    if (disposed || failed || playPending) return;
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
      if (!failed) callbacks.onMetadata(audio);
    },
    ended: () => {
      if (!failed) callbacks.onEnded();
    },
    seeking: () => callbacks.onSeeking(true),
    seeked: () => callbacks.onSeeking(false),
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
