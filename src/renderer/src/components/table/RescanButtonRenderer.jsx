import { useState } from 'react';
import { IoMdRefreshCircle } from 'react-icons/io';
import './styles/RescanButtonRenderer.css';

const RescanButtonRenderer = ({ data }) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (!data?.error) return null;

  async function handleRescanTrack() {
    setPending(true);
    setError('');
    try {
      await window.tagEditApi.invoke('rescan-track-error', data.audiotrack, data.track_id);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rescan-cell">
      <button
        type="button"
        className="rescan-btn"
        onClick={handleRescanTrack}
        disabled={pending}
        aria-busy={pending}
        title={pending ? 'Rescanning file…' : 'Rescan file'}
        aria-label="Rescan"
      >
        <IoMdRefreshCircle />
      </button>
      <span className="rescan-msg">{error || data.error}</span>
    </div>
  );
};

export default RescanButtonRenderer;
