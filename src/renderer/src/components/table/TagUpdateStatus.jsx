import { useState } from 'react';
import useIpcEvent from '../../hooks/useIpcEvent';
import StatusTagLoader from './StatusTagLoader';
import TagSaveReport from './TagSaveReport';

const TagUpdateState = ({ updateStatus, setUpdateStatus, setTagReport }) => {
  const [report, setReport] = useState(null);
  const [showReport, setShowReport] = useState(false);

  const handleUpdateTagsStatus = (msg) => {
    if (!msg?.status) return;
    setUpdateStatus(msg.status);
    setShowReport(false);
    if (msg.status === 'starting') {
      setReport(null);
      return;
    }
    const { status, passed = [], failed = [], affected = [] } = msg;
    const nextReport = {
      status,
      passed,
      failed,
      affected,
      error: msg.error || (status === 'error' ? msg.message || 'Tag update failed.' : ''),
      trackIds: (msg.res?.files || []).map((file) => file.track_id)
    };
    setReport(nextReport);
    setTagReport(nextReport);
  };
  useIpcEvent('updated-tags', handleUpdateTagsStatus, 'tagEditApi');

  const handleDismiss = () => {
    setShowReport(false);
    setReport(null);
    setUpdateStatus('');
    setTagReport({ result: '', passed: [], failed: [] });
  };

  return (
    <>
      {updateStatus === 'starting' && <StatusTagLoader config="status-tag-loader" />}
      {['success', 'failed', 'partial_status', 'error'].includes(updateStatus) && (
        <div className="tag-update-status-notice">
          <span className="status">{report?.error || updateStatus}</span>
          <button type="button" className="status-view" onClick={() => setShowReport(true)}>
            View
          </button>
          <button type="button" className="status-dismiss" onClick={handleDismiss}>
            Dismiss
          </button>
        </div>
      )}
      {showReport && report && (
        <TagSaveReport report={report} onClose={() => setShowReport(false)} />
      )}
    </>
  );
};
export default TagUpdateState;
