import { useTheme } from '../../ThemeContext';
import { useAudio } from './audioContext';
import CustomSlider from './CustomSlider';
import { PiStopBold } from 'react-icons/pi';
import { FaRegCirclePause } from 'react-icons/fa6';
import '../../themes.css';

import './styles/TableAudioControls.css';

const TableAudioControls = () => {
  const { stopTrack, volume, changeVolume } = useAudio();
  const { theme } = useTheme();
  const handleVolumeChange = (newVolume) => {
    changeVolume(newVolume); // Directly update volume
  };

  return (
    <div className={`centralControlContainer ${theme}`}>
      <span className="audioCtrl">
        <PiStopBold onClick={stopTrack} className="audioCtrl-icon" />
      </span>

      <span className="audioCtrl">
        <FaRegCirclePause className="audioCtrl-icon" />
      </span>
      <CustomSlider
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={handleVolumeChange}
        className="volumeSlider"
      />
    </div>
  );
};

export default TableAudioControls;
