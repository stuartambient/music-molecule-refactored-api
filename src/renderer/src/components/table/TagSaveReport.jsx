import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './styles/TagSaveReport.css';

const filePath = (file) => file.track || file.id || file.audiotrack || '';

export default function TagSaveReport({ report, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    dialog.current.showModal();
    return () => previousFocus?.focus();
  }, []);
  const entries = [
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
      <h2 id="tag-save-report-title">Tag save results</h2>
      {report.error ? (
        <p role="alert">{report.error}</p>
      ) : (
        <p>
          {report.passed.length} updated · {report.failed.length} failed
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
              {file.error && <small>{file.error}</small>}
            </li>
          );
        })}
      </ul>
      {!entries.length && <p>No file details were returned.</p>}
      {entries.length > 100 && <p>Showing the first 100 of {entries.length} files.</p>}
      <button type="button" autoFocus onClick={onClose}>
        Close
      </button>
    </dialog>,
    document.body
  );
}
