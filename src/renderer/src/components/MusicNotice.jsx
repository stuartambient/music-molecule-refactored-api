import { useAudioPlayer } from '../mainAudioContext';
import '../style/PlaybackError.css';

export default function MusicNotice() {
  const { state, dispatch } = useAudioPlayer();
  const notice = state.musicNotice;
  if (!notice || state.playbackError) return null;
  return (
    <div
      className="playback-error"
      role={notice.busy ? 'status' : 'alert'}
      aria-busy={!!notice.busy}
    >
      <strong>{notice.title}</strong>
      <p>{notice.message}</p>
      {notice.examples?.length > 0 && (
        <details>
          <summary>
            Entry details (showing {notice.examples.length} of{' '}
            {notice.entryCount ?? notice.examples.length})
          </summary>
          {notice.examples.map((entry, index) => (
            <p key={index}>
              {entry.path && (
                <span className="playback-error-path">
                  {entry.path}
                  <br />
                </span>
              )}
              {entry.message}
            </p>
          ))}
        </details>
      )}
      <div className="playback-error-actions">
        <button type="button" onClick={() => dispatch({ type: 'dismiss-music-notice' })}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
