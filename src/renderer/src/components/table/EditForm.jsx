import { useState, useEffect, useMemo } from 'react';
import { editableColumns } from './EditableColumns';
import { openChildWindow } from '../ChildWindows/openChildWindow';
import { useTheme } from '../../ThemeContext';
import useIpcEvent from '../../hooks/useIpcEvent';
import './styles/EditForm.css';
import '../../themes.css';

function EditForm({
  onUpdate,
  nodesSelected,
  hiddenColumns,
  getSelectedNodes
  /* handleCellContextMenu */
}) {
  const { theme } = useTheme();

  const initialState = editableColumns.reduce((acc, col) => {
    acc[col] = '';
    return acc;
  }, {});

  const [formData, setFormData] = useState(initialState);
  /* const [savedImage, setSavedImage] = useState(null); */
  const [imageFolder, setImageFolder] = useState(null);
  /*  const [savedFolder, setSavedFolder] = useState(null);
   */

  const hiddenColIds = useMemo(
    () => new Set(hiddenColumns.filter((c) => c.hide).map((c) => c.colId)),
    [hiddenColumns]
  );
  useEffect(() => {
    if (imageFolder) {
      const delayDownload = true;
      window.tagEditApi.invoke('select-image-from-folder', imageFolder, delayDownload);
    }
  }, [imageFolder]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleMenu = (col) => {
    console.log('col: ', col.target.id);
    if (col.target.id !== 'picture-location') {
      return window.tagEditApi.send('show-context-menu', {}, 'tag-context-menu');
    } else {
      const selectedNode = nodesSelected[0];
      const album = selectedNode.data.album ? selectedNode.data.album : '';
      const artist = selectedNode.data.albumArtists
        ? selectedNode.data.albumArtists
        : selectedNode.data.performers
          ? selectedNode.data.performers
          : '';
      const path = selectedNode.data.audiotrack;
      console.log('album: ', album, 'artist: ', artist, 'path: ', path);
      window.tagEditApi.send('show-context-menu', { artist, album, path }, 'form-picture');
    }
  };

  const handleForSubmit = (values) => {
    console.log('values: ', values);
    /*   setSavedImage(values); */
    setFormData((prevFormData) => ({
      ...prevFormData,
      'picture-location': values.tempFile
    }));
  };

  useIpcEvent('for-submit-form', handleForSubmit, 'tagEditApi');

  const handleSaveImageFolder = (value) => {
    /* setSavedFolder(value); */
    setFormData((prevFormData) => ({
      ...prevFormData,
      'picture-location': value
    }));
  };

  useIpcEvent('save-image-folder', handleSaveImageFolder, 'tagEditApi');

  const formSearchOnline = (params) => {
    console.log('params: ', params);
    return openChildWindow(
      'cover-search-alt-tags',
      'cover-search-alt-tags',
      {
        width: 700,
        height: 600,
        show: false,
        resizable: true,
        preload: 'coverSearchAlt',
        sandbox: true,
        webSecurity: true,
        contextIsolation: true
      },
      params
    );
  };

  const handleFormMenu = (option) => {
    const nodesObj = getSelectedNodes();
    const artist = nodesObj.artist;
    const title = nodesObj.title;
    const path = nodesObj.path;
    if (option.type === 'form-search-online') {
      formSearchOnline({ artist, title, path, type: option.type });
    } else {
      setImageFolder(path);
    }
  };

  useIpcEvent('form-menu-command', handleFormMenu, 'tagEditApi');

  function convertToCorrectType(key, value) {
    if (value === '-') return null;
    const numTypes = ['year', 'disc', 'discCount', 'track', 'trackCount'];
    if (numTypes.includes(key)) {
      return Number(value);
    }
    return value;
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    const multiRowChanges = [];
    nodesSelected.forEach((node) => {
      Object.keys(formData).forEach((key) => {
        if (formData[key]) {
          const newValue = convertToCorrectType(key, formData[key]);
          console.log('newValue: ', newValue);

          const changeObj = {
            rowId: node.id,
            field: key,
            newValue,
            oldValue: node.data[key]
          };
          multiRowChanges.push(changeObj);
        }
      });
    });
    if (multiRowChanges.length) {
      setFormData(
        Object.keys(formData).reduce((acc, key) => {
          acc[key] = ''; // Reset each field to an empty string
          return acc;
        }, {})
      );
      return onUpdate(multiRowChanges);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {editableColumns.map((col) => {
        return !hiddenColIds.has(col) ? (
          <div key={col}>
            <label htmlFor={col}>{`${col} :`}</label>
            {col === 'picture-location' ? (
              <input
                name={col}
                id={col}
                value={formData[col]}
                onChange={handleChange}
                onContextMenu={handleMenu}
                style={{ flex: '1', minWidth: '0' }}
              />
            ) : (
              <input
                name={col}
                id={col}
                value={formData[col]}
                onChange={handleChange}
                onContextMenu={handleMenu}
                style={{ flex: '1', minWidth: '0' }}
              />
            )}
          </div>
        ) : null;
      })}
      <button type="submit">Submit</button>
    </form>
  );
}

export default EditForm;
