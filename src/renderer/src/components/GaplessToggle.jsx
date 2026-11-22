import { useAudioPlayer } from '../mainAudioContext';
import '../style/GaplessToggle.css';

export default function GaplessToggle() {
  const { state, dispatch } = useAudioPlayer();
  return (
    <button
      type="button"
      className="gapless-toggle"
      aria-label="Gapless playback"
      aria-pressed={!!state.playlistGapless}
      title="Gapless playback for Playlist and albums started from Covers. Stays enabled until turned off."
      onClick={() => dispatch({ type: 'toggle-playlist-gapless' })}
    >
      <span className="gapless-check" aria-hidden="true">
        {state.playlistGapless ? '✓' : ''}
      </span>
      Gapless
    </button>
  );
}
