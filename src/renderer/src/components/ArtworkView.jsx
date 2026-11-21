import { useEffect, useRef, useState } from 'react';
import { FaBackward, FaForward, FaHeart, FaPause, FaPlay, FaStop } from 'react-icons/fa';
import { useAudioPlayer } from '../mainAudioContext';
import '../style/ArtworkView.css';

const time = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
};

export default function ArtworkView({ onExit, onControl }) {
  const { state, dispatch } = useAudioPlayer();
  const exit = useRef(null);
  const audio = state.audioRef.current;
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const previousFocus = document.activeElement;
    exit.current.focus();
    const escape = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onExit();
      }
    };
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('keydown', escape);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onExit]);

  useEffect(() => {
    const update = () => {
      setPosition(Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    update();
    for (const name of ['timeupdate', 'loadedmetadata', 'seeked', 'emptied', 'durationchange'])
      audio.addEventListener(name, update);
    return () => {
      for (const name of ['timeupdate', 'loadedmetadata', 'seeked', 'emptied', 'durationchange'])
        audio.removeEventListener(name, update);
    };
  }, [audio, state.playbackRequest]);

  return (
    <section
      className={`artwork-view ${state.mainTheme}`}
      role="dialog"
      aria-modal="true"
      aria-label="Expanded album artwork"
    >
      <header className="artwork-toolbar">
        <span>Now playing</span>
        <button type="button" ref={exit} onClick={onExit}>
          Exit artwork view <span aria-hidden="true">↙</span>
        </button>
      </header>
      <div className="artwork-stage">
        {state.cover && state.cover !== 'not available' ? (
          <img src={state.cover} alt={`${state.album || 'Album'} artwork`} />
        ) : (
          <p>No artwork available</p>
        )}
      </div>
      <footer className="artwork-footer">
        <div className="artwork-track">
          <strong>{state.title || 'No track selected'}</strong>
          <span>{[state.artist, state.album].filter(Boolean).join(' · ')}</span>
        </div>
        <div className="artwork-progress">
          <span>{time(position)}</span>
          <input
            type="range"
            aria-label="Playback position"
            min="0"
            max={duration || 1}
            step="0.1"
            value={Math.min(position, duration)}
            disabled={!duration || !!state.playbackError}
            onChange={(event) => {
              audio.currentTime = Number(event.target.value);
              setPosition(audio.currentTime);
            }}
          />
          <span>{time(duration)}</span>
        </div>
        <div className="artwork-bottom">
          <div className="artwork-transport" aria-label="Playback controls">
            <button
              type="button"
              id="like"
              aria-label="Like track"
              aria-pressed={!!state.isLiked}
              disabled={!state.active}
              onClick={onControl}
            >
              <FaHeart />
            </button>
            <button
              type="button"
              id="backward"
              aria-label="Previous track"
              disabled={!state.active}
              onClick={onControl}
            >
              <FaBackward />
            </button>
            <button
              type="button"
              id="pauseplay"
              aria-label={state.pause ? 'Play' : 'Pause'}
              disabled={!state.playbackTrack}
              onClick={onControl}
            >
              {state.pause ? <FaPlay /> : <FaPause />}
            </button>
            <button
              type="button"
              id="forward"
              aria-label="Next track"
              disabled={!state.active}
              onClick={onControl}
            >
              <FaForward />
            </button>
            <button
              type="button"
              id="stop"
              aria-label="Stop"
              disabled={!state.playbackTrack}
              onClick={onControl}
            >
              <FaStop />
            </button>
          </div>
          <label className="artwork-volume">
            Volume{' '}
            <input
              type="range"
              aria-label="Volume"
              min="0"
              max="1"
              step="0.01"
              value={state.volume}
              onChange={(event) => {
                const volume = Number(event.target.value);
                audio.volume = volume;
                dispatch({ type: 'set-volume', volume });
              }}
            />
          </label>
        </div>
      </footer>
    </section>
  );
}
