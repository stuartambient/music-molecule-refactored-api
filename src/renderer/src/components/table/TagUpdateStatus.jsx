import { useCallback } from 'react';
import useIpcEvent from '../../hooks/useIpcEvent';
import StatusTagLoader from './StatusTagLoader';

const TagUpdateState = ({
  updateStatus,
  setUpdateStatus,
  rescanStatus,
  setRescanStatus,
  setViewUpdate,
  tagReport,
  setTagReport,
  undos,
  setUndos
}) => {
  /* const [tagReport, setTagReport] = useState({ result: '', passed: [], failed: [] }); */
  /*   useEffect(() => {
    if (updateStatus && updateStatus !== 'starting') {
      setTimeout(() => setUpdateStatus(''), 30000);
    }
  }, [updateStatus, setUpdateStatus]); */

  const handleUpdateTagsStatus = (msg) => {
    console.log('handleUpdateTagsStatus hit');
    setUpdateStatus(msg.status);
    if (!Array.isArray(msg?.res?.files)) return;
    const { status, passed = [], failed = [] } = msg;
    const trackIds = msg.res.files.map((file) => file.track_id);
    setTagReport({ status, passed, failed, trackIds });
    return;
  };

  useIpcEvent('updated-tags', handleUpdateTagsStatus, 'tagEditApi');

  /*  const handleTagStatusRequest = () => {
    console.log('status request');
  }; */

  const handleView = () => {
    setViewUpdate(true);
  };

  const dismissHandler = useCallback(() => {
    setTagReport({ result: '', passed: [], failed: [] });
    /* setUndos([]); */
    console.log('dismiss handler: ', undos);
  }, [setTagReport, setUndos]);

  const handleDismiss = () => {
    console.log('dismiss');
    setUpdateStatus('');
    dismissHandler();
  };

  const tagUpdateStatuses = ['success', 'failed', 'partial_status'];

  return (
    <>
      {updateStatus === 'starting' && <StatusTagLoader config="status-tag-loader" />}

      {tagUpdateStatuses.includes(updateStatus) && (
        <div className="tag-update-status-notice">
          <span className="status">{updateStatus}</span>
          <span className="status-view" onClick={handleView}>
            View
          </span>
          <span className="status-dismiss" onClick={handleDismiss}>
            Dismiss
          </span>
        </div>
      )}
    </>
  );
};

export default TagUpdateState;
