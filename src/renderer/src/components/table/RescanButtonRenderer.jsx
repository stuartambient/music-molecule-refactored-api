import { IoMdRefreshCircle } from 'react-icons/io';
import './styles/RescanButtonRenderer.css';

const RescanButtonRenderer = (props) => {
  const { data, context } = props;
  /* console.log('rescanButtonRenderer: ', data.audiotrack); */

  if (!data?.error) return null;
  /* console.log('data error: ', data.error); */

  async function handleRescanTrack(track, id) {
    await window.tagEditApi.invoke('rescan-track-error', track, id);
  }

  // No error → render nothing
  /*   if (!error) return null; */

  return (
    <div className="rescan-cell">
      <button
        type="button"
        className="rescan-btn"
        onClick={() => handleRescanTrack(data.audiotrack, data.track_id)}
        title="Rescan file"
        aria-label="Rescan"
      >
        <IoMdRefreshCircle />
      </button>
      <span className="rescan-msg">{data.error}</span>
    </div>
  );
};

export default RescanButtonRenderer;
