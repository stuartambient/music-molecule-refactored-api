import { useTheme } from '../../editorThemeContext';
import { useAudio } from './audioContext';
import { PiStopBold } from 'react-icons/pi';
import { FaRegCirclePause, FaRegCirclePlay } from 'react-icons/fa6';
import { FiVolume2 } from 'react-icons/fi';
import '../../themes.css';
import './styles/TableAudioControls.css';

const clock = (value) => {
  const total = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const seconds = String(total % 60).padStart(2, '0');
  const minutes = Math.floor(total / 60);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
};

const TableAudioControls = () => {
  const {
    currentTrack,
    isPlaying,
    elapsed,
    duration,
    error,
    togglePlayback,
    stopTrack,
    seekTo,
    volume,
    changeVolume
  } = useAudio();
  const { theme } = useTheme();
  const filename = currentTrack?.split(/[\\/]/).at(-1);
  const canSeek = Boolean(currentTrack && duration > 0);
  return (
    <div className={`centralControlContainer ${theme}`} role="group" aria-label="Audio preview">
      <button
        type="button"
        aria-label="Stop preview"
        title="Stop preview"
        disabled={!currentTrack}
        onClick={stopTrack}
      >
        <PiStopBold />
      </button>
      <button
        type="button"
        aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
        title={isPlaying ? 'Pause preview' : 'Play preview'}
        disabled={!currentTrack}
        onClick={togglePlayback}
      >
        {isPlaying ? <FaRegCirclePause /> : <FaRegCirclePlay />}
      </button>
      <span className="preview-track-name" title={currentTrack || ''}>
        {filename || 'Select a track to preview'}
      </span>
      <span className="preview-time">{clock(elapsed)}</span>
      <input
        className="preview-seek"
        type="range"
        min="0"
        max={duration || 1}
        step="0.1"
        value={canSeek ? Math.min(elapsed, duration) : 0}
        disabled={!canSeek}
        aria-label="Preview position"
        aria-valuetext={`${clock(elapsed)} of ${clock(duration)}`}
        onChange={(event) => seekTo(Number(event.target.value))}
      />
      <span className="preview-time">{clock(duration)}</span>
      <FiVolume2 className="preview-volume-icon" aria-hidden="true" />
      <input
        className="preview-volume"
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={volume}
        aria-label="Preview volume"
        onChange={(event) => changeVolume(Number(event.target.value))}
      />
      {error && (
        <span className="preview-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
};
export default TableAudioControls;
