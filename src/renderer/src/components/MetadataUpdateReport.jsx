import { useId, useState } from 'react';

const displayDate = (value) =>
  typeof value === 'number' && Number.isFinite(value)
    ? new Date(value).toLocaleString()
    : 'Unknown';
const fileDetails = (file) =>
  [
    `${file.source === 'catalog' ? 'Previously recorded Track Error: ' : ''}${file.error || file.reason || 'Catalog metadata updated'}`,
    ...(file.previousModified !== undefined
      ? [
          `Previous catalog timestamp: ${displayDate(file.previousModified)}`,
          `File modified: ${displayDate(file.modified)}`
        ]
      : [])
  ].join('\n');

function FileSection({ title, files, note }) {
  const noteId = useId();
  const [visible, setVisible] = useState(100);
  return (
    <section className="metadata-report-section" aria-label={title}>
      <h3>
        {title} ({files.length})
        {note && (
          <button
            type="button"
            className="metadata-report-info"
            aria-label="About catalog entries updated"
            aria-describedby={noteId}
          >
            ⓘ
          </button>
        )}
      </h3>
      {note && (
        <p id={noteId} role="tooltip" className="metadata-report-tooltip">
          {note}
        </p>
      )}
      {!files.length ? (
        <p>None</p>
      ) : (
        <ul>
          {files.slice(0, visible).map((file, index) => (
            <li key={`${file.track_id || file.id}-${index}`}>
              <span className="metadata-report-file" title={file.id}>
                {index + 1} - {file.id?.split(/[\\/]/).pop() || 'Unknown file'}
              </span>
              <span className="metadata-report-location" title={file.id}>
                {file.id}
              </span>
              <span className="metadata-report-error" title={fileDetails(file)}>
                {file.error || file.reason || 'Catalog metadata updated'}
              </span>
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
      <h2>Catalog report</h2>
      {report.error && <p role="alert">{report.error}</p>}
      {report.nochange && <p>No changes found.</p>}
      <FileSection
        title="Catalog entries updated"
        files={modified}
        note="Some tag editors update a file’s modification time when saving, even if no tag values change. These entries show files whose catalog metadata was refreshed, not necessarily files with edited tags."
      />
      <FileSection title="Missing files" files={missing} />
      <FileSection title="Bad / unreadable files" files={bad} />
    </div>
  );
}
