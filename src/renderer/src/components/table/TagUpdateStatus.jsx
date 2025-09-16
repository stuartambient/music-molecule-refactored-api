import { useEffect } from 'react';
import StatusTagLoader from './StatusTagLoader';

const TagUpdateState = ({ updateStatus, setUpdateStatus, tagReport, setTagReport }) => {
  /* const [tagReport, setTagReport] = useState({ result: '', passed: [], failed: [] }); */
  /*   useEffect(() => {
    if (updateStatus && updateStatus !== 'starting') {
      setTimeout(() => setUpdateStatus(''), 30000);
    }
  }, [updateStatus, setUpdateStatus]); */

  useEffect(() => {
    const handleUpdateTagsStatus = (msg) => {
      console.log('msg: ', msg);
      setUpdateStatus(msg.status);
      const { status, passed = [], failed = [] } = msg;
      setTagReport({ status, passed, failed });
      return;
    };

    window.metadataEditingApi.onUpdateTagsStatus(handleUpdateTagsStatus);

    return () => {
      window.metadataEditingApi.off('updated-tags', handleUpdateTagsStatus);
    };
  }, [setUpdateStatus, setTagReport]);

  const handleTagStatusRequest = () => {
    console.log('status request');
  };

  const handleView = () => {
    console.log('view');
  };

  const handleDismiss = () => {
    console.log('dismiss');
    setUpdateStatus('');
    setTagReport({ result: '', passed: [], failed: [] });
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
