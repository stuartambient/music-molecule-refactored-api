import { useRef, useState, useEffect } from 'react';
import { AudioContext } from './audioContext';
import { streamingUrl } from '../../../../shared/streamingUrl.js';

export const AudioProvider = ({ children }) => {
  const audioRef = useRef(null);
  if (!audioRef.current) audioRef.current = new Audio();
  const selected = useRef(null);
  const request = useRef(0);
  const mounted = useRef(true);
  const failed = useRef(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const [volume, setVolume] = useState(1);

  const reportError = () => {
    failed.current = true;
    setIsPlaying(false);
    setDuration(0);
    setElapsed(0);
    setError('This track could not be previewed. Check that the file is available and supported.');
  };
  const start = () => {
    const token = ++request.current;
    try {
      Promise.resolve(audioRef.current.play()).catch((error) => {
        if (mounted.current && token === request.current && error?.name !== 'AbortError')
          reportError();
      });
    } catch {
      if (mounted.current && token === request.current) reportError();
    }
  };
  const playTrack = (track) => {
    const audio = audioRef.current;
    if (selected.current !== track || failed.current) {
      request.current++;
      audio.pause();
      selected.current = track;
      failed.current = false;
      setCurrentTrack(track);
      setElapsed(0);
      setDuration(0);
      setError('');
      audio.src = streamingUrl(track);
      start();
    } else if (audio.paused || audio.ended) {
      if (audio.ended) {
        audio.currentTime = 0;
        setElapsed(0);
      }
      start();
    } else {
      request.current++;
      audio.pause();
    }
  };
  const togglePlayback = () => {
    if (selected.current) playTrack(selected.current);
  };
  const stopTrack = () => {
    const audio = audioRef.current;
    request.current++;
    selected.current = null;
    failed.current = false;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    setCurrentTrack(null);
    setIsPlaying(false);
    setElapsed(0);
    setDuration(0);
    setError('');
  };
  const seekTo = (position) => {
    const audio = audioRef.current;
    if (
      !selected.current ||
      !Number.isFinite(audio.duration) ||
      audio.duration <= 0 ||
      !Number.isFinite(position)
    )
      return;
    try {
      const next = Math.max(0, Math.min(position, audio.duration));
      audio.currentTime = next;
      setElapsed(next);
    } catch {
      setError('This preview could not seek to that position. Try again after it loads.');
    }
  };
  const changeVolume = (next) => {
    if (!Number.isFinite(next)) return;
    const value = Math.max(0, Math.min(1, next));
    audioRef.current.volume = value;
    setVolume(value);
  };

  useEffect(() => {
    mounted.current = true;
    const audio = audioRef.current;
    const syncTiming = () => {
      setDuration(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0);
      setElapsed(Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0);
    };
    const onPlay = () => {
      if (selected.current) setIsPlaying(true);
    };
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      if (audio.ended) {
        setIsPlaying(false);
        syncTiming();
      }
    };
    const onError = () => {
      if (selected.current && audio.error) reportError();
    };
    const onVolume = () => setVolume(audio.volume);
    const listeners = {
      loadedmetadata: syncTiming,
      durationchange: syncTiming,
      timeupdate: syncTiming,
      seeking: syncTiming,
      seeked: syncTiming,
      emptied: syncTiming,
      play: onPlay,
      pause: onPause,
      ended: onEnded,
      error: onError,
      volumechange: onVolume
    };
    for (const [event, listener] of Object.entries(listeners))
      audio.addEventListener(event, listener);
    const reset = () => stopTrack();
    window.addEventListener('resetAudio', reset);
    return () => {
      mounted.current = false;
      window.removeEventListener('resetAudio', reset);
      for (const [event, listener] of Object.entries(listeners))
        audio.removeEventListener(event, listener);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, []);

  return (
    <AudioContext.Provider
      value={{
        currentTrack,
        isPlaying,
        elapsed,
        duration,
        error,
        playTrack,
        togglePlayback,
        stopTrack,
        seekTo,
        volume,
        changeVolume
      }}
    >
      {children}
    </AudioContext.Provider>
  );
};
