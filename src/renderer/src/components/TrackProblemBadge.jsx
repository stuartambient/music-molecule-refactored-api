import { HiOutlineExclamationCircle } from 'react-icons/hi';
import { useAudioPlayer } from '../mainAudioContext';
import { getTrackProblem } from '../utility/trackProblems';
import '../style/TrackProblem.css';

export default function TrackProblemBadge({ track }) {
  const { state } = useAudioPlayer();
  const problem = getTrackProblem(state, track);
  if (!problem) return null;
  const label = problem.backend === 'availability' ? 'Unavailable' : 'Playback failed';
  const player = problem.backend === 'mpv' ? 'mpv' : 'the built-in player';
  const detail = `${problem.message} ${problem.backend === 'availability' ? '' : `Last attempt with ${player} failed. `}Select the track to retry.`;
  return (
    <span className="track-problem-badge" title={detail} aria-label={`${label}. ${detail}`}>
      <HiOutlineExclamationCircle aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
