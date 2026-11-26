import { useEffect, useId, useRef, useState } from 'react';
import useIpcEvent from '../../hooks/useIpcEvent';
import TagSaveReport from './TagSaveReport';
import './styles/TagSaveStatus.css';

const TagUpdateState = ({ updateStatus, setUpdateStatus, setTagReport }) => {
  const pendingVersion = useRef(0);
  const attentionId = useId();
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [pending, setPending] = useState([]);
  const [actionError, setActionError] = useState('');
  const [report, setReport] = useState(null);
  const [view, setView] = useState(null);

  useEffect(() => {
    let closed = false;
    const version = pendingVersion.current;
    window.tagEditApi
      .getPendingTagSaves?.()
      .then((files) => {
        if (!closed && version === pendingVersion.current) setPending(files);
      })
      .catch((error) => {
        if (!closed) setActionError(error.message);
      });
    return () => {
      closed = true;
    };
  }, []);

  const recheck = async () => {
    setActionError('');
    try {
      await window.tagEditApi.retryTagSaves();
    } catch (error) {
      setActionError(error.message);
    }
  };

  const forgetRecord = async (file) => {
    const version = ++pendingVersion.current;
    const result = await window.tagEditApi.forgetTagSave({
      track_id: file.track_id,
      revision: file.revision
    });
    if (result.status === 'error') {
      const current = await window.tagEditApi.getPendingTagSaves();
      if (version === pendingVersion.current) setPending(current);
      throw new Error(result.error || 'Unable to forget this unfinished save.');
    }
    if (version === pendingVersion.current) {
      setPending(result.pending);
      if (!result.pending.length) {
        setView(null);
        setAttentionOpen(false);
      }
    }
  };

  const handleUpdateTagsStatus = (msg) => {
    if (!msg?.status) return;
    const version = ++pendingVersion.current;
    setUpdateStatus(msg.status);
    if (msg.pending) {
      setPending(msg.pending);
      if (!msg.pending.length) setAttentionOpen(false);
    } else if (msg.status !== 'starting')
      window.tagEditApi
        .getPendingTagSaves?.()
        .then((files) => {
          if (version === pendingVersion.current) setPending(files);
        })
        .catch((error) => setActionError(error.message));
    setView(null);
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
      outcomes: msg.outcomes,
      error: msg.error || (status === 'error' ? msg.message || 'Tag update failed.' : ''),
      trackIds: (msg.res?.files || []).map((file) => file.track_id)
    };
    setReport(nextReport);
    setTagReport(nextReport);
  };
  useIpcEvent('updated-tags', handleUpdateTagsStatus, 'tagEditApi');

  const handleDismiss = () => {
    setView(null);
    setReport(null);
    setUpdateStatus('');
    setTagReport({ result: '', passed: [], failed: [] });
  };

  const busy = updateStatus === 'starting';
  const hasLatest =
    ['success', 'failed', 'partial_status', 'error'].includes(updateStatus) && report;
  const confirmed = report?.passed.length || 0;
  const latestTitle =
    updateStatus === 'success'
      ? 'Saved and checked'
      : updateStatus === 'partial_status'
        ? 'Partly saved'
        : 'Save needs attention';
  const latestDescription =
    updateStatus === 'success'
      ? `${confirmed} ${confirmed === 1 ? 'file' : 'files'} saved and catalog updated.`
      : 'Open the result to see what was saved and what could not be confirmed.';
  const pendingReport = {
    title: 'Files needing attention',
    kind: 'pending',
    status: 'failed',
    passed: [],
    failed: [],
    affected: [],
    outcomes: pending.map((file) => ({ ...file, outcome: 'Needs attention' }))
  };
  const visibleReport = view === 'pending' ? pendingReport : report;

  return (
    <>
      {(busy || hasLatest || pending.length > 0 || actionError) && (
        <section className="tag-save-panel" aria-label="Tag saves">
          <header className="tag-save-panel-heading">
            <h3>Tag saves</h3>
            {pending.length > 0 && (
              <button
                type="button"
                className="tag-save-attention-toggle"
                aria-expanded={attentionOpen}
                aria-controls={attentionId}
                onClick={() => setAttentionOpen((open) => !open)}
                title="Show or hide saves that still need attention"
              >
                <span aria-hidden="true">!</span> Needs attention · {pending.length}{' '}
                <span aria-hidden="true">{attentionOpen ? '▾' : '▸'}</span>
              </button>
            )}
          </header>
          {actionError && (
            <p className="tag-save-action-error" role="alert">
              {actionError}
            </p>
          )}
          {(busy || hasLatest) && (
            <section
              className={`tag-save-row tag-save-latest ${busy ? 'is-busy' : updateStatus === 'success' ? 'is-confirmed' : 'is-attention'}`}
              aria-label="Latest save"
            >
              <span className={`tag-save-mark ${busy ? 'is-spinning' : ''}`} aria-hidden="true">
                {busy ? '↻' : updateStatus === 'success' ? '✓' : '!'}
              </span>
              <div className="tag-save-copy" role="status">
                <span className="tag-save-eyebrow">Latest save</span>
                <strong>{busy ? 'Saving and checking…' : latestTitle}</strong>
                <p>{busy ? 'Checking saved tags and updating the catalog.' : latestDescription}</p>
              </div>
              {!busy && (
                <div className="tag-save-actions">
                  <button type="button" onClick={() => setView('latest')}>
                    View result
                  </button>
                  <button type="button" className="tag-save-quiet" onClick={handleDismiss}>
                    Dismiss result
                  </button>
                </div>
              )}
            </section>
          )}
          {pending.length > 0 && attentionOpen && (
            <section
              id={attentionId}
              className="tag-save-row tag-save-attention is-attention"
              aria-label="Files needing attention"
            >
              <span className="tag-save-mark" aria-hidden="true">
                !
              </span>
              <div className="tag-save-copy">
                <span className="tag-save-eyebrow">Still needs attention</span>
                <strong>
                  {pending.length} {pending.length === 1 ? 'file' : 'files'} awaiting confirmation
                </strong>
                <p>Kept here until resolved, even after newer saves.</p>
                <small>
                  Rechecking reads files and updates the catalog. It does not rewrite tags.
                </small>
              </div>
              <div className="tag-save-actions">
                <button type="button" disabled={busy} onClick={() => setView('pending')}>
                  Review files
                </button>
                <button
                  type="button"
                  className="tag-save-primary"
                  disabled={busy}
                  onClick={recheck}
                >
                  Recheck files
                </button>
              </div>
            </section>
          )}
        </section>
      )}
      {view && visibleReport && (
        <TagSaveReport
          report={visibleReport}
          onClose={() => setView(null)}
          onRetry={view === 'pending' && pending.length ? recheck : undefined}
          onForget={view === 'pending' ? forgetRecord : undefined}
        />
      )}
    </>
  );
};
export default TagUpdateState;
