import { useEffect, useState } from 'react';
import { useAudioPlayer } from '../mainAudioContext';
import '../style/PlaybackPreferences.css';

export default function PlaybackPreferences() {
  const { state, dispatch } = useAudioPlayer();
  const [status, setStatus] = useState(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let current = true;
    Promise.resolve(window.ipcApi.mpvStatus?.())
      .then((value) => {
        if (current) setStatus(value || { available: false });
      })
      .catch(() => {
        if (current) setStatus({ available: false });
      });
    return () => {
      current = false;
    };
  }, [reload]);
  return (
    <div className="playback-preferences">
      <label htmlFor="playback-backend">Playback engine</label>
      <select
        id="playback-backend"
        value={state.playbackBackend || 'builtin'}
        onChange={(event) =>
          dispatch({ type: 'set-playback-backend', backend: event.target.value })
        }
      >
        <option value="builtin">Built-in player</option>
        <option value="mpv" disabled={!status?.available}>
          mpv (experimental)
        </option>
      </select>
      <p>
        mpv streams large tracks without loading whole songs into memory. The Playlist Gapless
        option controls continuous transitions.
      </p>
      {status && !status.available && (
        <div role="status">
          <p>mpv is not available in this installation.</p>
          <button type="button" onClick={() => setReload((value) => value + 1)}>
            Check again
          </button>
        </div>
      )}
      {status?.available && <p role="status">mpv is available.</p>}
    </div>
  );
}
