import { useEffect, useRef } from 'react';
import { createAvailablePlayback } from '../utility/availablePlayback';
import { convertDuration } from './useTime';
import { handlePicture } from '../utility/audioUtils';

export default function usePlayback(state, dispatch, playbackSnapshot) {
  const sessionRef = useRef(null);
  const track = state.playbackTrack;
  const request = state.playbackRequest;
  const startTime = state.playbackStartTime || 0;

  useEffect(() => {
    if (!track) return;
    const audio = state.audioRef.current;
    const source =
      'streaming://' +
      encodeURI(track.audiotrack).replaceAll('?', '%3F').replaceAll('#', '%23') +
      '?playback=' +
      crypto.randomUUID();
    const session = createAvailablePlayback(
      audio,
      source,
      () => window.ipcApi.checkTrackAvailability(track.audiotrack),
      {
        onAvailable: () => loadCover(),
        onMetadata: (element) => {
          dispatch({ type: 'duration', request, duration: convertDuration(element) });
          dispatch({ type: 'set-delay', request, delay: true });
        },
        onError: (error) => {
          console.error('Playback failed', { trackId: track.track_id, source, ...error });
          dispatch({ type: 'playback-error', request, error });
        },
        onEnded: () =>
          dispatch({ type: 'advance-track', direction: 1, play: true, ended: true, request }),
        onSeeking: (seeking) => dispatch({ type: 'seeking', seeking }),
        onVolume: (volume) => dispatch({ type: 'set-volume', volume })
      },
      { startTime }
    );
    sessionRef.current = session;
    if (playbackSnapshot) {
      playbackSnapshot.current = () => ({ request, position: session.getPosition() });
    }

    // Artwork and like lookups cannot delay source loading or restart playback.
    function loadCover() {
      window.ipcApi
        .getCover(track.audiotrack)
        .then((picture) => {
          if (session.isCurrent()) {
            dispatch({
              type: 'set-cover',
              request,
              cover: picture ? handlePicture(picture) : 'not available'
            });
          }
        })
        .catch((error) => console.warn('Artwork unavailable:', error.message));
    }

    window.ipcApi
      .isLiked(track.track_id)
      .then((liked) => {
        if (session.isCurrent())
          dispatch({ type: 'update-like', request, isLiked: liked?.like === 1 });
      })
      .catch((error) => console.warn('Like lookup failed:', error.message));

    return () => {
      session.dispose();
      sessionRef.current = null;
      if (playbackSnapshot) playbackSnapshot.current = null;
    };
  }, [track, request, startTime, state.audioRef, dispatch, playbackSnapshot]);

  useEffect(() => {
    if (state.pause) sessionRef.current?.pause();
    else sessionRef.current?.play();
  }, [state.pause, track, request]);
}
