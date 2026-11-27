import { CiPlay1, CiPause1 } from 'react-icons/ci';
import { useAudio } from './audioContext';
import './styles/PlayButtonRenderer.css';

const PlayButtonRenderer = (props) => {
  const { currentTrack, isPlaying, playTrack } = useAudio();
  const track = props.node.data.audiotrack;

  const playing = currentTrack === track && isPlaying;

  const handleClick = () => {
    playTrack(track);
  };

  /*   const handleStopClick = () => {
    stopTrack();
  }; */

  return (
    <button
      type="button"
      className="playButton"
      onClick={handleClick}
      aria-label={playing ? 'Pause track preview' : 'Play track preview'}
    >
      {playing ? (
        <CiPause1 alt="Pause" className="playIcon" />
      ) : (
        <CiPlay1 alt="Play" className="playIcon" />
      )}
    </button>
  );
};

export default PlayButtonRenderer;
