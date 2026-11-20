import { useState } from 'react';
import '../style/NativeDragDropFolderInput.css';

function NativeDragDropFolderInput({ rootDirs, setRootDirs }) {
  const [folders, setFolders] = useState([]);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const edited = () => {
    setSaved(false);
    setError('');
  };

  const pickFolders = async () => {
    setPicking(true);
    setError('');
    try {
      const paths = await window.ipcApi.pickFolder();
      if (paths?.length) {
        setFolders((current) => [
          ...new Set([...current, ...paths.filter((path) => !rootDirs.includes(path))])
        ]);
        setSaved(false);
      }
    } catch {
      setError('Could not open the folder picker. Please try again.');
    } finally {
      setPicking(false);
    }
  };

  const saveFolders = async (event) => {
    event.preventDefault();
    if (saving || picking) return;
    const roots = [...new Set([...rootDirs, ...folders])];
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const result = await window.ipcApi.updateRoots(roots);
      if (!Array.isArray(result)) throw new Error('Save failed');
      setRootDirs(roots);
      setFolders([]);
      setSaved(true);
    } catch {
      setError('Could not save the music folders. Your edits are still here; please try again.');
    } finally {
      setSaving(false);
    }
  };

  const folderList = (items, pending) => (
    <ul className="folder-list">
      {items.map((folder) => (
        <li key={folder} className="folder-list--item">
          <button
            className="folder-path"
            type="button"
            onClick={() => window.ipcApi.openAlbumFolder(folder)}
            title={folder}
          >
            {folder}
          </button>
          <button
            className="settings-secondary remove-button"
            type="button"
            aria-label={`Remove ${folder}`}
            onClick={() => {
              if (pending) setFolders((current) => current.filter((path) => path !== folder));
              else setRootDirs((current) => current.filter((path) => path !== folder));
              edited();
            }}
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <form
      className="setup-form"
      onSubmit={saveFolders}
      aria-label="Music folders"
      aria-busy={saving || picking}
    >
      <fieldset disabled={saving || picking}>
        <legend>Library folders</legend>
        {rootDirs.length ? (
          folderList(rootDirs, false)
        ) : (
          <p className="settings-help">No music folders saved yet.</p>
        )}
        {folders.length > 0 && (
          <div className="pending-folders">
            <h3>Folders to add</h3>
            {folderList(folders, true)}
          </div>
        )}
        <p className="settings-help">
          Removing a folder from this list does not delete its files. Save to apply your changes.
        </p>
        <div className="settings-actions">
          <button type="button" className="settings-secondary" onClick={pickFolders}>
            Browse for folders…
          </button>
          <button type="submit">{saving ? 'Saving…' : 'Save music folders'}</button>
        </div>
      </fieldset>
      {saved && (
        <p className="settings-result" role="status">
          Music folders saved.
        </p>
      )}
      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export default NativeDragDropFolderInput;
