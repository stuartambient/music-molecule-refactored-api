import { useState, useEffect } from 'react';
import { editableColumns } from './EditableColumns';
import { openChildWindow } from '../ChildWindows/openChildWindow';
import { useTheme } from '../../ThemeContext';
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
  useEffect(() => {
    if (imageFolder) {
      const delayDownload = true;
      window.metadataEditingApi.selectImageFromFolder(imageFolder, delayDownload);
    }
  }, [imageFolder]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleMenu = (col) => {
    console.log('col: ', col.target.id);
    /*     window.metadataEditingApi.showContextMenu({}, 'tag-context-menu'); */
    if (col.target.id !== 'picture-location') {
      return window.metadataEditingApi.showContextMenu({}, 'tag-context-menu');
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
      window.metadataEditingApi.showContextMenu({ artist, album, path }, 'form-picture');
    }
  };

  useEffect(() => {
    const handleForSubmit = (values) => {
      console.log('values: ', values);
      /*   setSavedImage(values); */
      setFormData((prevFormData) => ({
        ...prevFormData,
        'picture-location': values.tempFile
      }));
    };
    window.metadataEditingApi.onImagesForSubmit(handleForSubmit);
    return () => {
      window.metadataEditingApi.off('for-submit-form', handleForSubmit);
    };
  }, []);

  useEffect(() => {
    const handleSaveImageFolder = (value) => {
      /* setSavedFolder(value); */
      setFormData((prevFormData) => ({
        ...prevFormData,
        'picture-location': value
      }));
    };

    window.metadataEditingApi.onSaveImageFolder(handleSaveImageFolder);
    return () => {
      window.metadataEditingApi.off('save-image-folder', handleSaveImageFolder);
    };
  }, []);

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

  useEffect(() => {
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
    window.metadataEditingApi.onFormMenuCommand(handleFormMenu);
    return () => {
      window.metadataEditingApi.off('form-menu-command', handleFormMenu);
    };
  }, [getSelectedNodes]);

  // Utility function to convert data types based on the field name
  function convertToCorrectType(key, value) {
    if (value === '-') return null;
    const numTypes = ['year', 'disc', 'discCount', 'track', 'trackCount'];
    // Add more cases as necessary for other specific fields or types
    /*   console.log('key: ', key, 'value: ', value); */
    if (numTypes.includes(key)) {
      return Number(value);
    }
    return value; // Return as is if no specific conversion is needed
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
          /*    console.log('changeObj: ', changeObj); */
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
    <form onSubmit={handleSubmit} /* style={{ gridRow: '3/4' }} */>
      {editableColumns.map((col) => {
        /*         console.log('edit form column: ', col); */
        return !hiddenColumns.includes(col) ? (
          <div
            key={col} /* style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }} */
          >
            <label htmlFor={col} /* style={{ marginRight: '8px', whiteSpace: 'nowrap' }} */>
              {`${col} :`}
            </label>
            {col === 'picture-location' ? (
              <input
                name={col}
                id={col}
                //value={savedImage && savedImage.tempFile ? savedImage.tempFile : null}
                /* placeholder={} */
                value={formData[col]}
                onChange={handleChange}
                /* onContextMenu={hanhandleCellContextMenu({params})} */
                onContextMenu={handleMenu}
                style={{ flex: '1', minWidth: '0' }}
              />
            ) : (
              <input
                name={col}
                id={col}
                value={formData[col]}
                /* placeholder={col} */
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
