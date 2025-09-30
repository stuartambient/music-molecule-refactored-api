import { useState } from 'react';
import '../style/NativeDragDropFolderInput.css';

function NativeDragDropFolderInput({ rootDirs, setRootDirs }) {
  const [folders, setFolders] = useState([]);
  const [rootChanges, setRootChanges] = useState([]);

  const handleRootsUpdate = (e) => {
    console.log(e.target.id);

    const sendRoots = async (roots) => {
      const sentRoots = await window.ipcApi.invoke('update-roots', roots);
      if (sentRoots) {
        setRootChanges(sentRoots);
      }
    };

    if (e.target.id === 'roots-update' || e.currentTarget.id === 'roots-update') {
      sendRoots([...rootDirs, ...folders]);
    }
  };

  const handleOpenFolder = (e) => {
    /* window.api.openAlbumFolder(e.target.id); */
    const folder = e.currentTarget.id;
    window.ipcApi.send('open-album-folder', folder);
  };

  const removeFolder = (index) => {
    setFolders((prevFolders) => prevFolders.filter((_, i) => i !== index));
  };

  const removeFormerFolder = (folder) => {
    console.log('folder: ', folder);
    setRootDirs((prevRootDirs) => prevRootDirs.filter((dir) => dir !== folder));
  };

  return (
    <div className="roots-form">
      <h3>Select Folders</h3>
      <button
        type="button"
        onClick={async () => {
          const paths = await window.ipcApi.invoke('pick-folder');
          if (paths?.length) {
            const updated = paths.filter((p) => !rootDirs.includes(p) && !folders.includes(p));
            setFolders((prev) => [...prev, ...updated]);
          }
        }}
        style={{
          border: '2px dashed #ccc',
          padding: '20px',
          textAlign: 'center',
          cursor: 'pointer',
          marginBottom: '20px',
          width: '100%'
        }}
      >
        Browse for Folders…
      </button>

      <ul className="folder-list">
        {folders.map((folder, index) => (
          <li key={index} className="folder-list--item">
            <span onClick={handleOpenFolder} className="item-name" id={folder}>
              <u>{folder}</u>
            </span>
            <button className="remove-button" onClick={() => removeFolder(index)}>
              Remove
            </button>
          </li>
        ))}
      </ul>

      <ul className="folder-list">
        {rootDirs.length > 0 ? (
          <li className="folder-list--item title">Current folders:</li>
        ) : (
          <li className="folder-list--item title">No roots folders saved</li>
        )}
        {rootDirs.map((dir) => (
          <li key={dir} className="folder-list--item">
            <span onClick={handleOpenFolder} className="item-name" id={dir}>
              <u>{dir}</u>
            </span>
            <button className="remove-button" onClick={() => removeFormerFolder(dir)}>
              Remove
            </button>
          </li>
        ))}
      </ul>

      <button className="roots-update" id="roots-update" type="button" onClick={handleRootsUpdate}>
        <span className="text">Update</span>
      </button>

      {rootChanges.length > 0 && (
        <ul className="folder-list results-panel">
          {rootChanges.map((item, i) => (
            <li key={i}>
              {Object.entries(item).map(([key, val]) => (
                <div key={key}>
                  {key}: {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default NativeDragDropFolderInput;
