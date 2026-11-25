import { useState } from 'react';

function FileSection({ title, files }) {
  const [visible, setVisible] = useState(100);
  return (
    <section className="metadata-report-section">
      <h3>
        {title} ({files.length})
      </h3>
      {!files.length ? (
        <p>None</p>
      ) : (
        <ul>
          {files.slice(0, visible).map((file, index) => (
            <li key={`${file.track_id || file.id}-${index}`}>
              <strong>{file.id?.split(/[\\/]/).pop() || 'Unknown file'}</strong>
              <small>{file.id}</small>
              {file.error && <small>{file.error}</small>}
            </li>
          ))}
        </ul>
      )}
      {files.length > visible && (
        <button type="button" onClick={() => setVisible((count) => count + 100)}>
          Show more ({files.length - visible} remaining)
        </button>
      )}
    </section>
  );
}

export default function MetadataUpdateReport({ report }) {
  const { missing = [], bad = [], modified = [] } = report.details || {};
  return (
    <div className="metadata-update-report">
      <h2>Update Meta results</h2>
      {report.error && <p role="alert">{report.error}</p>}
      <p>
        {report.nochange
          ? 'No changes found.'
          : `${report.modified} modified · ${report.failed} failed`}
      </p>
      <FileSection title="Missing files" files={missing} />
      <FileSection title="Bad / unreadable files" files={bad} />
      <FileSection title="Modified files" files={modified} />
    </div>
  );
}
