import { useAudioPlayer } from '../mainAudioContext';
import { getAdjacentTrack } from '../utility/playbackState';
import '../style/PlaybackError.css';

export default function PlaybackError() {
  const { state, dispatch } = useAudioPlayer();
  if (!state.playbackError) return null;
  const next = getAdjacentTrack(state, 1);
  const hasNext = next || (state.activeList === 'tracklistActive' && state.tracksHasMore);

  return (
    <div className="playback-error" role="alert">
      <strong>Playback paused</strong>
      <p className="playback-error-track">{state.title}</p>
      <p>{state.playbackError.message}</p>
      {state.playbackError.path && (
        <p className="playback-error-path">{state.playbackError.path}</p>
      )}
      {!hasNext && <p>No next track is available in the current list.</p>}
      <div className="playback-error-actions">
        <button type="button" onClick={() => dispatch({ type: 'retry-track' })}>
          Retry
        </button>
        <button
          type="button"
          disabled={!hasNext || !!state.pendingAdvance}
          onClick={() => dispatch({ type: 'advance-track', direction: 1, play: true })}
        >
          {state.pendingAdvance ? 'Loading next track…' : 'Skip'}
        </button>
        <button type="button" onClick={() => dispatch({ type: 'reset', pause: true })}>
          Stop
        </button>
      </div>
    </div>
  );
}
