import { useAudioPlayer } from '../mainAudioContext';
import { FaHeart, FaBackward, FaForward, FaRandom } from 'react-icons/fa';
import { GiPauseButton, GiPlayButton } from 'react-icons/gi';
import { AiFillHome } from 'react-icons/ai';
/* import Icon1 from '../assets/icon_1.png'; */
import '../style/Controls.css';

const Controls = ({ handlePlayerControls }) => {
  const { state /* , dispatch  */ } = useAudioPlayer();
  const controlsClassNames = () => {
    if (state.player && !state.minimalmode) {
      return 'controls';
    }
    if (state.minimalmode) {
      return `controls controls--minimalmode ${state.mainTheme}`;
    }
    if (state.home) {
      return 'controls controls-home';
    }
  };

  const shuffleButtonClassName = () => {
    if (state.tracksShuffle && state.listType === 'files') {
      return 'btn on';
    }
    if (state.playlistShuffle && state.listType === 'playlist') {
      return 'btn plshuffle';
    } else {
      return 'btn';
    }
  };
  return (
    <ul className={controlsClassNames()}>
      <li
        className={state.isLiked && state.active ? 'btn likeBtn isliked' : 'btn likeBtn'}
        id="like"
        onClick={handlePlayerControls}
      >
        <FaHeart />
      </li>

      {state.pause ? (
        <li
          className={state.active ? 'btn btn-blink' : 'btn'}
          id="pauseplay"
          onClick={handlePlayerControls}
        >
          <GiPlayButton />
        </li>
      ) : (
        <li
          className={state.active ? 'btn btn-blink' : 'btn'}
          id="pauseplay"
          onClick={handlePlayerControls}
        >
          <GiPauseButton />
        </li>
      )}
      <li className="btn" id="backward" onClick={handlePlayerControls}>
        <FaBackward />
      </li>

      <li className="btn" id="forward" onClick={handlePlayerControls}>
        <FaForward />
      </li>
      {state.listType === 'files' && (
        <li className={shuffleButtonClassName()} id="shuffle" onClick={handlePlayerControls}>
          <FaRandom />
        </li>
      )}
      {!state.minimalmode && !state.home && (
        <li
          className={state.library ? 'btn on' : 'btn'}
          id="playlist"
          onClick={handlePlayerControls}
        >
          <AiFillHome />
        </li>
      )}
    </ul>
  );
};

export default Controls;
