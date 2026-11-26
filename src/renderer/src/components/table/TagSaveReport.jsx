import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './styles/TagSaveReport.css';

const filePath = (file) => file.track || file.id || file.audiotrack || '';

export default function TagSaveReport({ report, onClose, onRetry, onForget }) {
  const dialog = useRef(null);
  const [confirmForget, setConfirmForget] = useState(null);
  const [forgetting, setForgetting] = useState(false);
  const [forgetError, setForgetError] = useState('');
  const forget = async (file) => {
    setForgetting(true);
    setForgetError('');
    try {
      await onForget(file);
      setConfirmForget(null);
    } catch (error) {
      setForgetError(error.message);
    } finally {
      setForgetting(false);
    }
  };
  useEffect(() => {
    const previousFocus = document.activeElement;
    dialog.current.showModal();
    return () => previousFocus?.focus();
  }, []);
  const entries = report.outcomes || [
    ...report.failed.map((file) => ({ ...file, outcome: 'Failed' })),
    ...report.passed.map((file) => ({ ...file, outcome: 'Updated' })),
    ...(report.status === 'error'
      ? report.affected.map((file) => ({ ...file, outcome: 'Not confirmed' }))
      : [])
  ];

  return createPortal(
    <dialog
      ref={dialog}
      className="tag-save-report"
      aria-labelledby="tag-save-report-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2 id="tag-save-report-title">{report.title || 'Latest save result'}</h2>
      {report.error ? (
        <p role="alert">{report.error}</p>
      ) : (
        <p>
          {report.kind === 'pending'
            ? `${entries.length} ${entries.length === 1 ? 'file needs' : 'files need'} attention`
            : report.outcomes
              ? `${report.outcomes.filter((file) => file.success).length} confirmed · ${report.outcomes.filter((file) => !file.success).length} need attention`
              : `${report.passed.length} updated · ${report.failed.length} failed`}
        </p>
      )}
      <ul aria-label="Saved files">
        {entries.slice(0, 100).map((file, index) => {
          const path = filePath(file);
          const name = path.split(/[\\/]/).pop() || file.track_id || 'Unknown file';
          return (
            <li key={`${file.track_id || path}-${index}`}>
              <span title={path}>{name}</span>
              <strong>{file.outcome}</strong>
              {file.verification && (
                <span className="tag-save-stages">
                  Tags:{' '}
                  {{
                    confirmed: 'verified',
                    mismatch: 'not fully saved',
                    unavailable: 'not verified'
                  }[file.verification.status] || file.verification.status}{' '}
                  · Catalog:{' '}
                  {{ updated: 'updated', failed: 'not updated', not_started: 'not checked' }[
                    file.catalog.status
                  ] || file.catalog.status}
                </span>
              )}
              {file.error && <small>{file.error}</small>}
              {onForget &&
                (confirmForget === file.track_id ? (
                  <div
                    className="tag-save-forget-confirm"
                    role="group"
                    aria-label="Confirm forgetting unfinished save"
                  >
                    <p>
                      Remove this unfinished-save record? Music Molecule will stop tracking this
                      save. The audio file and catalog entry will not be changed.
                    </p>
                    {forgetError && <p role="alert">{forgetError}</p>}
                    <button
                      type="button"
                      disabled={forgetting}
                      className="tag-save-forget-confirm-button"
                      onClick={() => forget(file)}
                    >
                      {forgetting ? 'Forgetting…' : 'Forget record'}
                    </button>
                    <button
                      type="button"
                      disabled={forgetting}
                      onClick={() => {
                        setConfirmForget(null);
                        setForgetError('');
                      }}
                    >
                      Keep record
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={forgetting}
                    className="tag-save-forget"
                    onClick={() => {
                      setConfirmForget(file.track_id);
                      setForgetError('');
                    }}
                  >
                    Forget unfinished save
                  </button>
                ))}
            </li>
          );
        })}
      </ul>
      {!entries.length && <p>No file details were returned.</p>}
      {entries.length > 100 && <p>Showing the first 100 of {entries.length} files.</p>}
      {onRetry && (
        <p>
          Rechecking reads the files and refreshes the catalog without rewriting tags. Missing tag
          values must be edited and saved explicitly.
        </p>
      )}
      {onRetry && (
        <button type="button" disabled={forgetting} onClick={onRetry}>
          Recheck files
        </button>
      )}
      <button type="button" autoFocus onClick={onClose}>
        Close
      </button>
    </dialog>,
    document.body
  );
}
