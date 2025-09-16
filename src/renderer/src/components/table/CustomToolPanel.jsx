import { useState } from 'react';
import Modal from '../Modal';
/* import { openChildWindow } from '../ChildWindows/openChildWindow'; */
import TableAudioControls from './TableAudioControls';
import TagUpdateState from './TagUpdateStatus';
import { useTheme } from '../../ThemeContext';
import { GiHamburgerMenu } from 'react-icons/gi';
import './styles/CustomToolPanel.css';
import '../../themes.css';

const CustomToolPanel = ({
  onChange,
  onClick,
  /* onUpdate, */
  isPanelVisible,
  togglePanelVisibility,
  /*   nodesSelected, */
  undos,
  hiddenColumns,
  tagReport,
  setTagReport
  /* setAllColumnsVisible */
}) => {
  const [updateStatus, setUpdateStatus] = useState('');

  /*  const [isPanelVisible, setIsPanelVisible] = useState(true); */
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);
  const { toggleTheme, theme } = useTheme();

  const fields = [
    /* { name: 'audiotrack', label: 'audiotrack', defaultChecked: true }, */
    { name: 'title', label: 'title', defaultChecked: true },
    { name: 'performers', label: 'performers', defaultChecked: true },
    { name: 'album', label: 'album', defaultChecked: true },
    { name: 'genres', label: 'genres', defaultChecked: true },
    { name: 'like', label: 'like', defaultChecked: true },
    { name: 'error', label: 'error', defaultChecked: true },
    { name: 'albumArtists', label: 'albumArtists', defaultChecked: true },
    { name: 'audioBitrate', label: 'audioBitrate', defaultChecked: true },
    { name: 'audioSampleRate', label: 'audioSamplerate', defaultChecked: true },
    { name: 'codecs', label: 'codecs', defaultChecked: true },
    { name: 'beatsPerMinute', label: 'beatsPerMinute', defaultChecked: true },
    { name: 'composers', label: 'composers', defaultChecked: true },
    { name: 'conductor', label: 'conductor', defaultChecked: true },
    { name: 'copyright', label: 'copyright', defaultChecked: true },
    { name: 'comment', label: 'comment', defaultChecked: true },
    { name: 'disc', label: 'disc', defaultChecked: true },
    { name: 'discCount', label: 'discCount', defaultChecked: true },
    { name: 'description', label: 'description', defaultChecked: true },
    { name: 'duration', label: 'duration', defaultChecked: true },
    { name: 'isCompilation', label: 'isCompilation', defaultChecked: true },
    { name: 'isrc', label: 'isrc', defaultChecked: true },
    { name: 'lyrics', label: 'lyrics', defaultChecked: true },
    { name: 'performersRole', label: 'performersRole', defaultChecked: true },
    { name: 'pictures', label: 'pictures', defaultChecked: true },
    { name: 'picture-location', label: 'picture-location', defaultChecked: true },
    { name: 'publisher', label: 'publisher', defaultChecked: true },
    { name: 'remixedBy', label: 'remixedBy', defaultChecked: true },
    { name: 'replayGainAlbumGain', label: 'replayGainAlbumGain', defaultChecked: false },
    { name: 'replayGainAlbumPeak', label: 'replayGainAlbumPeak', defaultChecked: false },
    { name: 'replayGainTrackGain', label: 'replayGainTrackGain', defaultChecked: false },
    { name: 'replayGainTrackPeak', label: 'replayGainTrackPeak', defaultChecked: false },
    { name: 'track', label: 'track', defaultChecked: true },
    { name: 'trackCount', label: 'trackCount', defaultChecked: true },
    { name: 'year', label: 'year', defaultChecked: true }
  ];

  return (
    <>
      <div className={`hamburger-container ${theme}`}>
        <GiHamburgerMenu className="hamburger-btn" onClick={togglePanelVisibility} />
        {/*     <button className="hamburger-btn" onClick={togglePanelVisibility}>
          <span></span>
          <span></span>
          <span></span>
        </button> */}
      </div>
      <div>
        <TableAudioControls />
      </div>

      <div className={`column-panel ${theme} ${isPanelVisible ? '' : 'hidden'}`}>
        <fieldset>
          <Modal
            className="modal"
            fields={fields}
            openModal={openModal}
            closeModal={closeModal}
            isModalOpen={isModalOpen}
            onChange={onChange}
            /* setAllColumnsVisible={setAllColumnsVisible} */
            /* onBulkToggle={(checked) => setAllColumnsVisible(checked)} */
            hiddenColumns={hiddenColumns}
          />

          <button id="deselect-all" className="panel-button" onClick={onClick}>
            Deselect All
          </button>

          <button
            id="save-all"
            className={undos >= 1 ? 'panel-button active' : 'panel-button'}
            onClick={onClick}
          >
            Save all
          </button>
          <button id="cancel-all" className="panel-button" onClick={onClick}>
            Cancel all
          </button>

          <button id="undo-last" className="panel-button" onClick={onClick}>
            Undo
          </button>
          <button id="redo-last" className="panel-button" onClick={onClick}>
            Redo
          </button>
          <button className="panel-button" onClick={openModal}>
            Column Preferences
          </button>
          <button id="theme" className="panel-button" onClick={toggleTheme}>
            Theme
          </button>
          <TagUpdateState
            updateStatus={updateStatus}
            tagReport={tagReport}
            setTagReport={setTagReport}
            setUpdateStatus={setUpdateStatus}
          />
        </fieldset>
      </div>
    </>
  );
};

export default CustomToolPanel;
