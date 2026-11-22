import { useEffect, useRef } from 'react';
import { createAvailablePlayback } from '../utility/availablePlayback';
import { GaplessPlayback, streamingSource } from '../utility/gaplessPlayback';
import { MpvPlayback } from '../utility/mpvPlayback';
import { getAdjacentTrack, getPlaybackQueue, getPlaybackPosition } from '../utility/playbackState';
import { convertDuration } from './useTime';
import { handlePicture } from '../utility/audioUtils';

export default function usePlayback(state, dispatch, playbackSnapshot) {
  const sessionRef = useRef(null);
  const latestState = useRef(state);
  latestState.current = state;
  const track = state.playbackTrack;
  const request = state.playbackRequest;
  const startTime = state.playbackStartTime || 0;
  const gapless =
    state.playlistGapless && state.activeList === 'playlistActive' && !state.gaplessBypass;
  const mpv = state.playbackBackend === 'mpv';
  const handoff = mpv ? state.mpvTransition : state.gaplessTransition;
  const queue = getPlaybackQueue(state);

  useEffect(() => {
    const audio = state.audioRef.current;
    let session = sessionRef.current;
    if (!track) {
      session?.dispose();
      sessionRef.current = null;
      audio.useTransport?.(null);
      if (playbackSnapshot) playbackSnapshot.current = null;
      return;
    }
    const callbacks = {
      onAvailable: () => loadCover(),
      onMetadata: () => {
        dispatch({ type: 'duration', request, duration: convertDuration(audio) });
        dispatch({ type: 'set-delay', request, delay: true });
      },
      onError: (error) => {
        console.error('Playback failed', { trackId: track.track_id, ...error });
        dispatch({ type: 'playback-error', request, error });
      },
      onEnded: () =>
        dispatch({ type: 'advance-track', direction: 1, play: true, ended: true, request }),
      onSeeking: (seeking) => dispatch({ type: 'seeking', seeking }),
      onVolume: (volume) => dispatch({ type: 'set-volume', volume }),
      onTransition: (next, index, token) => {
        const current = latestState.current;
        const adjacent = getAdjacentTrack(current, 1);
        if (current.playbackRequest !== request) {
          session.pause();
          return;
        }
        if (
          !adjacent ||
          adjacent.index !== index ||
          adjacent.track.track_id !== next.track_id ||
          adjacent.track.audiotrack !== next.audiotrack
        ) {
          session.pause();
          callbacks.onEnded();
          return;
        }
        dispatch({
          type: mpv ? 'mpv-transition' : 'gapless-transition',
          request,
          trackId: next.track_id,
          trackPath: next.audiotrack,
          index,
          token
        });
      },
      onFallback: (error) => {
        console.warn('Gapless preparation failed', {
          trackId: track.track_id,
          path: track.audiotrack,
          reason: error.message,
          cause: error.cause?.message
        });
        dispatch({
          type: 'gapless-fallback',
          request,
          reason: error.message,
          position: session.getPosition() ?? startTime
        });
      }
    };
    const adopted =
      (mpv ? session?.kind === 'mpv' : gapless && session?.kind === 'gapless') &&
      session.adopt(track, getPlaybackPosition(latestState.current), handoff, callbacks);
    if (!adopted) {
      session?.dispose();
      audio.useTransport?.(null);
      if (mpv) {
        session = new MpvPlayback({
          track,
          index: getPlaybackPosition(latestState.current),
          queue: getPlaybackQueue(latestState.current),
          source: latestState.current.activeList,
          volume: audio.volume,
          gapless,
          startTime,
          callbacks
        });
        audio.useTransport(session);
        loadCover();
      } else if (gapless) {
        try {
          session = new GaplessPlayback({
            track,
            index: getPlaybackPosition(latestState.current),
            queue: latestState.current.playlistTracks,
            startTime,
            callbacks
          });
          audio.useTransport(session);
          loadCover();
        } catch (error) {
          console.warn('Gapless setup failed', error);
          dispatch({
            type: 'gapless-fallback',
            request,
            position: startTime,
            reason: error.message
          });
          sessionRef.current = null;
          return;
        }
      } else {
        session = createAvailablePlayback(
          audio,
          streamingSource(track),
          () => window.ipcApi.checkTrackAvailability(track.audiotrack),
          callbacks,
          { startTime }
        );
      }
      sessionRef.current = session;
    } else {
      loadCover();
    }
    if (playbackSnapshot)
      playbackSnapshot.current = () => ({ request, position: session.getPosition() });

    function loadCover() {
      window.ipcApi
        .getCover(track.audiotrack)
        .then((picture) => {
          if (session.isCurrent())
            dispatch({
              type: 'set-cover',
              request,
              cover: picture ? handlePicture(picture) : 'not available'
            });
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
  }, [
    track,
    request,
    startTime,
    gapless,
    mpv,
    handoff,
    state.audioRef,
    dispatch,
    playbackSnapshot
  ]);

  useEffect(() => {
    sessionRef.current?.updateQueue?.(queue);
  }, [queue]);

  useEffect(() => {
    if (state.pause) sessionRef.current?.pause();
    else
      sessionRef.current?.play()?.catch?.((error) => {
        dispatch({ type: 'playback-error', request, error: { message: error.message } });
      });
  }, [state.pause, track, request, gapless, mpv, dispatch]);

  useEffect(
    () => () => {
      sessionRef.current?.dispose();
      sessionRef.current = null;
      if (playbackSnapshot) playbackSnapshot.current = null;
    },
    [playbackSnapshot]
  );
}
