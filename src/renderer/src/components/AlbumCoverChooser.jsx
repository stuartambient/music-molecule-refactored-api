import { useEffect, useRef, useState } from 'react';
import { albumCoverUrl } from '../../../shared/albumCoverUrl.js';
import '../style/AlbumCoverChooser.css';

export default function AlbumCoverChooser({ album, onClose, onSelected }) {
  const dialog = useRef(null);
  const [choices, setChoices] = useState(null);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  useEffect(() => {
    let active = true;
    setError('');
    setChoices(null);
    window.ipcApi
      .getAlbumCoverChoices(album.path)
      .then((result) => {
        if (!active) return;
        setChoices(result);
        setSelected(
          result.images.some((image) => image.path === result.current)
            ? result.current
            : result.suggested || ''
        );
      })
      .catch(() => {
        if (active)
          setError('Could not read this album folder. Check that it is available and try again.');
      });
    return () => {
      active = false;
    };
  }, [album.path, reload]);
  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const result = await window.ipcApi.selectAlbumCover(album.path, selected);
      onSelected(result);
      onClose();
    } catch {
      setError(
        'Could not save this cover. The image or album may have moved. Reload the images and try again.'
      );
      setSaving(false);
    }
  };
  const browse = async () => {
    setSaving(true);
    setError('');
    try {
      const result = await window.ipcApi.pickAlbumCover(album.path);
      if (result.status === 'success') {
        onSelected(result);
        onClose();
      } else setSaving(false);
    } catch {
      setError(
        'Could not use that image. Check that it is available and the album folder is writable, then try again.'
      );
      setSaving(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="album-cover-chooser"
      aria-labelledby="album-cover-heading"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
    >
      <header>
        <h2 id="album-cover-heading">Choose album cover</h2>
        <p className="album-cover-folder" title={album.path}>
          {album.folder}
        </p>
        <p>
          Choose an album image below, or browse another folder. Images chosen elsewhere are copied
          into this album folder.
        </p>
      </header>
      {!choices && !error && <p role="status">Loading images…</p>}
      {error && (
        <p role="alert" className="album-cover-error">
          {error}
        </p>
      )}
      {choices && !choices.images.length && (
        <p>
          No supported images found here. Add a JPG, PNG, WebP or GIF to the album folder, then
          reload.
        </p>
      )}
      {choices && (
        <div className="album-cover-options" aria-label="Album images">
          {choices.images.map((image) => (
            <button
              type="button"
              key={image.path}
              className="album-cover-option"
              aria-pressed={selected === image.path}
              disabled={saving}
              onClick={() => setSelected(image.path)}
              title={image.name}
            >
              <img
                src={albumCoverUrl(image.path)}
                alt=""
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.alt = 'Image unavailable';
                }}
              />
              <span className="album-cover-filename">{image.name}</span>
              <span className="album-cover-note">
                {image.path === choices.current
                  ? 'Current cover'
                  : image.path === choices.suggested
                    ? 'Suggested'
                    : '\u00a0'}
              </span>
            </button>
          ))}
        </div>
      )}
      <footer>
        <button type="button" disabled={saving} onClick={browse}>
          Browse other folders…
        </button>
        <button type="button" disabled={saving} onClick={() => setReload((value) => value + 1)}>
          Reload images
        </button>
        <span />
        <button type="button" disabled={saving} onClick={onClose}>
          Cancel
        </button>
        <button type="button" disabled={!choices || !selected || saving} onClick={save}>
          {saving ? 'Saving…' : 'Use selected image'}
        </button>
      </footer>
    </dialog>
  );
}
