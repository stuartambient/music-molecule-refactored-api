import { useAudioPlayer } from '../mainAudioContext';
import { HiMiniBolt } from 'react-icons/hi2';
import { FaStop } from 'react-icons/fa';
import '../style/Extras.css';

const Extras = ({ handlePlayerControls }) => {
  const { state /* , dispatch  */ } = useAudioPlayer();
  return (
    <ul className="extras">
      <li className="btn" id="stop" onClick={handlePlayerControls}>
        <FaStop />
      </li>
      <li className="btn" id="miniplayer" onClick={handlePlayerControls}>
        <HiMiniBolt />
      </li>
      <li className={state.library ? 'library on' : 'library off'}>
        <p>library</p>
      </li>
      <li className={state.playlistShuffle || state.tracksShuffle ? 'shuffle on' : 'shuffle off'}>
        <p>shuffle</p>
      </li>
      {state.volume ? (
        <li className="volume on">
          <p>{state.volume}</p>
        </li>
      ) : (
        <li className="volume off">
          <p>{state.volume}</p>
        </li>
      )}
      <li className={state.seeking ? 'seeking on' : 'seeking off'}>
        <p>seeking</p>
      </li>
    </ul>
  );
};

export default Extras;
