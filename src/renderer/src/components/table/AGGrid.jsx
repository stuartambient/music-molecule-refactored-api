/* eslint-disable no-case-declarations */
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react'; // the AG Grid React Component
import {
  colorSchemeLightWarm,
  colorSchemeDarkBlue,
  AllCommunityModule,
  ValidationModule,
  ModuleRegistry
} from 'ag-grid-community';

// Register all Community features
ModuleRegistry.registerModules([AllCommunityModule, ValidationModule]);

import classNames from 'classnames';
import CustomLoadingOverlay from './CustomLoadingOverlay';
import CustomNoRowsOverlay from './CustomNoRowsOverlay';
import CustomToolPanel from './CustomToolPanel';
import { openChildWindow } from '../ChildWindows/openChildWindow';
import EditForm from './EditForm';
import { useColumnDefinitions } from './useTableDefinitions';
import { useColumnTypes } from './useColumnTypes';
import { themeQuartz } from 'ag-grid-community';
import PlayButtonRenderer from './PlayButtonRenderer';
import './styles/AGGrid.css';
import { useTheme } from '../../ThemeContext';

const AGGrid = ({ reset, setListType, setReset /*  data */ }) => {
  /* const [originalData, setOriginalData] = useState(null); */
  // eslint-disable-next-line no-unused-vars, unused-imports/no-unused-vars
  const [gridReady, setGridReady] = useState(false);
  const [rowData, setRowData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nodesSelected, setNodesSelected] = useState([]);
  const [numNodes, setNumNodes] = useState();
  const [isPanelVisible, setIsPanelVisible] = useState(true);
  const [isUndoAction, setIsUndoAction] = useState(false);
  const [isRedoAction, setIsRedoAction] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState([]);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [themeScheme, setThemeScheme] = useState(colorSchemeDarkBlue);

  /* console.log('AG Grid: ', { data, loading }); */

  /* const [imageFolderPath, setImageFolderPath] = useState(null); */
  const [tempFolder, setTempFolder] = useState(null);
  /* const [folderPath, setFolderPath] = useState(null); */
  const [tagReport, setTagReport] = useState({ result: '', passed: [], failed: [] });
  /*   const [picNode, setPicNode] = useState(null);
  const [picPath, setPicPath] = useState(null); */
  const [pendingPictureEdit, setPendingPictureEdit] = useState({});

  const gridRef = useRef(null);
  const [undos, setUndos] = useState([]);
  const [redos, setRedos] = useState([]);
  /* const isLoading = rowData === null || rowData === undefined; */

  const { theme } = useTheme();
  const failedIds = useMemo(() => tagReport?.failed?.map((item) => item.id) || [], [tagReport]);
  const failedErrorMap = useMemo(() => {
    return new Map(tagReport.failed.map(({ id, error }) => [id, error || 'Unknown error']));
  }, [tagReport]);

  const columnDefs = useColumnDefinitions(failedIds, failedErrorMap);
  const columnTypes = useColumnTypes();
  const components = useMemo(() => ({ PlayButtonRenderer }), []);

  useEffect(() => {
    theme === 'dark' ? setThemeScheme(colorSchemeDarkBlue) : setThemeScheme(colorSchemeLightWarm);
  }, [theme]);

  /*--------------------------------------------------*/

  useEffect(() => {
    const handleSendToChild = (e) => {
      console.log('results: ', e.results, e.results.length);
      /*  if (e.results.length === 0) return; */
      setListType(e.listType);
      setRowData(e.results);
      setReset(false);
      setLoading(false);
    };

    window.metadataEditingApi.onSendToChild(handleSendToChild);

    return () => {
      window.metadataEditingApi.off('send-to-child', handleSendToChild);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myTheme = useMemo(() => {
    return themeQuartz
      .withParams({ spacing: 12, fontSize: 16, headerFontWeight: 600 })
      .withPart(themeScheme);
  }, [themeScheme]);

  useEffect(() => {
    const loadPreferences = async () => {
      const preferences = await window.metadataEditingApi.getPreferencesSync();
      setHiddenColumns(preferences.hiddenColumns || []);
      setPrefsLoaded(true);
    };
    loadPreferences();
  }, []);

  useEffect(() => {
    if (gridRef.current?.api) {
      gridRef.current.api.forEachNode((node) => {
        console.log('AG Grid Row ID:', node.id, '→ track_id:', node.data?.track_id);
      });
    }
  }, []);

  useEffect(() => {
    const updateColPrefs = async () => {
      await window.metadataEditingApi.savePreferences({ hiddenColumns });
    };
    if (hiddenColumns.length > 0) {
      updateColPrefs();
    }
  }, [hiddenColumns]);

  useEffect(() => {
    if (prefsLoaded && gridRef.current?.api) {
      const gridApi = gridRef.current.api;

      // Ensure hiddenColumns is an array
      if (Array.isArray(hiddenColumns) && hiddenColumns.length > 0) {
        gridApi.setColumnsVisible(hiddenColumns, false); // Pass the array directly
      }
    }
  }, [prefsLoaded, hiddenColumns]);

  useEffect(() => {
    if (reset) {
      setRowData([]);
      setLoading(true);
    }
  }, [reset]);

  const resetAudio = () => {
    const event = new Event('resetAudio');
    window.dispatchEvent(event);
  };

  useEffect(() => {
    return () => {
      resetAudio();
    };
  }, []);

  const getRowId = useMemo(() => (params) => params.data.track_id, []);

  useEffect(() => {
    if (rowData && rowData.length > 0) {
      resetAudio();
      setUndos([]);
      setRedos([]);
      setNodesSelected([]);
      //setOriginalData(data);
    }
  }, [rowData]);

  useEffect(() => {
    setNumNodes(nodesSelected.length);
  }, [nodesSelected]);

  const onGridReady = useCallback((params) => {
    gridRef.current.api = params.api; // Attach the grid API to the ref
    console.log(gridRef.current.api.getColumnState());
    setGridReady(true);
  }, []);

  useEffect(() => {
    if (tagReport?.failed?.length && gridRef.current?.api) {
      gridRef.current.api.setFilterModel(null);
      gridRef.current.api.applyColumnState({
        state: [{ colId: 'failedSort', sort: 'asc' }],
        defaultState: { sort: null } // clears previous sorts
      });
      gridRef.current.api.ensureIndexVisible(0, 'top', { animated: true });
    }
  }, [tagReport]);

  /*   useEffect(() => {
    const hasErrors = tagReport?.failed?.length > 0;
    const columnApi = gridRef.current?.columnApi;
    if (columnApi) {
      columnApi.setColumnVisible('status', hasErrors);
    }
  }, [tagReport]); */

  const selectedNodesImagePicker = useCallback(() => {
    let artist, title /* , path */;
    let paths = [];
    const mismatchedNodes = [];

    const nodes = gridRef.current.api.getSelectedNodes();

    nodes.forEach((node, index) => {
      const { albumArtists, performers, album, audiotrack } = node.data;
      const currentArtist = (albumArtists || performers || '').trim();
      const currentAlbum = (album || '').trim();

      if (index === 0) {
        artist = currentArtist;
        title = currentAlbum;
      }

      if (artist === currentArtist && title === currentAlbum) {
        paths.push(audiotrack);
      } else {
        console.error('Artist or album mismatch detected!');
        mismatchedNodes.push(node);
      }
    });

    if (mismatchedNodes.length) {
      console.error('Mismatched nodes detected:', mismatchedNodes);
    }

    return { artist, title, path: paths };
  }, []);

  /*   const handleNumNodes = () => {
    const n = gridRef.current.api.getSelectedNodes();
    return n.length;
  }; */

  /*   const handleEmbedPicture = useCallback((values) => {
    console.log('handleEmbedPicture: ', values);
    let artist,
      title,
      path,
      type = values.type;

    if (type === 'single-track') {
      artist = values.params.artist;
      title = values.params.album;
      path = values.params.path;
    } else if (type === 'search-folder-single') {
      return setTempFolder(values.params.path);
    }
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
      { artist, title, path, type }
    );
  }, []);

  useEffect(() => {
    window.metadataEditingApi.onContextMenuCommand(handleEmbedPicture);
    return () => {
      window.metadataEditingApi.off('context-menu-command', handleEmbedPicture);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); */

  const embedPictureHandlerRef = useRef();

  useEffect(() => {
    embedPictureHandlerRef.current = (values) => {
      let artist,
        title,
        path,
        type = values.type;

      if (type === 'single-track') {
        artist = values.params.artist;
        title = values.params.album;
        path = values.params.path;
      } else if (type === 'search-folder-single') {
        return setTempFolder(values.params.path);
      }

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
        { artist, title, path, type }
      );
    };
  });

  useEffect(() => {
    const wrapped = (values) => embedPictureHandlerRef.current?.(values);

    window.metadataEditingApi.onContextMenuCommand(wrapped);
    return () => {
      window.metadataEditingApi.off('context-menu-command', wrapped);
    };
  }, []); // subscribe once */

  useEffect(() => {
    const handleTagUpdateStatus = (val) => {
      /* const currentFailedIds = tagReport?.failed?.map((item) => item.id) || []; */
      switch (val.status) {
        case 'success':
          return setUndos([]);

        case 'partial_status':
          /* return setUndos([]); */
          break;
        case 'failed': {
          const currentFailedIds = new Set(val.failed.map((f) => f.id));
          const retainedUndos = undos.filter((u) => currentFailedIds.has(u.audiotrack));
          console.log('retainedUndo: ', retainedUndos);
          setUndos(retainedUndos);
          break;
        }
        /* return setUndos([]); */
        default:
          break;
      }
    };

    window.metadataEditingApi.onUpdateTagsStatus(handleTagUpdateStatus);
    return () => {
      window.metadataEditingApi.off('updated-tags', handleTagUpdateStatus);
    };
  }, [tagReport, undos]);

  useEffect(() => {
    if (tempFolder) {
      console.log('select image from folder');
      window.metadataEditingApi.selectImageFromFolder(tempFolder, true);
    }
  }, [tempFolder]);

  useEffect(() => {
    if (pendingPictureEdit?.track_id && pendingPictureEdit?.newValue && gridRef.current?.api) {
      const node = gridRef.current.api.getRowNode(pendingPictureEdit.track_id);
      if (node) {
        node.setDataValue('picture-location', pendingPictureEdit.newValue);
      }
      setPendingPictureEdit(null); // clear after applying
    }
  }, [pendingPictureEdit]);

  useEffect(() => {
    const handleForSubmit = (values) => {
      if (nodesSelected.length > 1) return;
      setPendingPictureEdit((prev) => {
        if (!prev?.track_id) return prev;
        return { ...prev, newValue: values.tempFile };
      });
    };

    const handleImageFolder = (values) => {
      setPendingPictureEdit((prev) => {
        if (!prev?.track_id) return prev;
        return { ...prev, newValue: values };
      });
    };

    window.metadataEditingApi.onImagesForSubmit(handleForSubmit);
    window.metadataEditingApi.onSaveImageFolder(handleImageFolder);

    return () => {
      window.metadataEditingApi.off('for-submit-form', handleForSubmit);
      window.metadataEditingApi.off('save-image-folder', handleImageFolder);
    };
  }, [nodesSelected.length]);

  const togglePanelVisibility = () => {
    setIsPanelVisible(!isPanelVisible);
  };

  /*  const CustomNoDataOverlay = () => (
    <div className="ag-overlay-no-rows-center">No data available</div>
  ); */

  /*   const handleColumnPanel = (e) => {
    const col = e.target.name; // Get the column ID from the event
    if (gridRef.current.api) {
      const gridApi = gridRef.current.api; // Access the grid API
      const column = gridApi.getColumn(col); // Get the column object

      if (column) {
        const isVisible = column.isVisible(); // Check if the column is visible
        gridApi.setColumnsVisible([col], !isVisible); // Pass an array of column IDs
        updateHiddenColumns(col, !isVisible); // Update the hidden columns state
      }
    } else return;
  }; */

  /*   const handleColumnPanel = (payload) => {
    const gridApi = gridRef.current?.api;
    if (!gridApi) return;

    // Accept either a real event or a plain object
    const name = payload?.target?.name ?? payload?.name;
    let checked = payload?.target?.checked ?? payload?.checked;

    if (typeof name !== 'string') return; // bail if not a string

    // If caller didn't specify, fall back to toggle (optional)
    if (typeof checked !== 'boolean') {
      const col = gridApi.getColumn(name);
      checked = !(col && col.isVisible());
    }

    // ✅ Always pass an array of strings
    gridApi.setColumnsVisible([name], checked);

    // mirror local state
    setHiddenColumns((prev) =>
      checked ? prev.filter((c) => c !== name) : [...new Set([...prev, name])]
    );
  }; */

  /*   const handleMultiRowUpdate = (multiRowChanges) => {
    console.log('multiRowUChanges: ', multiRowChanges);
    multiRowChanges.forEach((edit) => {
      gridRef.current.api.forEachNodeAfterFilterAndSort((rowNode) => {
        if (rowNode.rowIndex === edit.rowId) {
          switch (edit.newValue) {
            case 'true':
              return rowNode.setDataValue(edit.field, 1);
            case 'false':
              return rowNode.setDataValue(edit.field, 0);
            default:
              rowNode.setDataValue(edit.field, edit.newValue);
          }
        }
      });
    });

    gridRef.current.api.refreshCells({ force: true });
  }; */

  const handleColumnPanel = (e) => {
    const gridApi = gridRef.current?.api;
    if (!gridApi) return;
    const { name: colId, checked } = e.target; // name must be a string colId
    gridApi.setColumnsVisible([colId], checked); // single string in array
    setHiddenColumns((prev) =>
      checked ? prev.filter((c) => c !== colId) : [...new Set([...prev, colId])]
    );
  };

  /*  const getAllColIds = () => (gridRef.current?.api.getColumns() || []).map((c) => c.getColId()); */

  /*   const setAllColumnsVisible = (checked) => {
    const gridApi = gridRef.current?.api;
    if (!gridApi) return;

    // only change what differs to reduce work
    const toChange = (gridApi.getColumns() || [])
      .filter((c) => c.isVisible() !== checked)
      .map((c) => c.getColId());

    if (toChange.length) gridApi.setColumnsVisible(toChange, checked);
    setHiddenColumns(checked ? [] : getAllColIds());
  }; */

  const handleMultiRowUpdate = (multiRowChanges) => {
    console.log('multirode changes: ', multiRowChanges);
    const nodeMap = new Map();
    gridRef.current.api.forEachNodeAfterFilterAndSort((node) => {
      if (node.id != null) {
        nodeMap.set(node.id, node);
      }
    });
    console.log('nodeMap: ', nodeMap);
    console.log(
      'multiRowChanges:',
      multiRowChanges.map((c) => c.rowId)
    );

    multiRowChanges.forEach((edit) => {
      const node = nodeMap.get(edit.rowId);
      if (!node) return;

      switch (edit.newValue) {
        case 'true':
          node.setDataValue(edit.field, 1);
          break;
        case 'false':
          node.setDataValue(edit.field, 0);
          break;
        default:
          node.setDataValue(edit.field, edit.newValue);
      }
    });

    gridRef.current.api.refreshCells({ force: true });
  };

  const handleCellValueChanged = useCallback(
    (event) => {
      if (!isUndoAction && !isRedoAction) {
        const { api, node, colDef } = event;
        if (node.data.error) {
          return;
        }
        const change = {
          rowId: node.id,
          field: event.colDef.field,
          audiotrack: event.data.audiotrack,
          newValue: event.newValue === '-' ? null : event.newValue,
          oldValue: event.oldValue
        };

        setUndos((prevUndos) => [...prevUndos, change]);

        api.flashCells({
          rowNodes: [node],
          columns: [colDef.field],
          flashDuration: 200,
          fadeDuration: 500
        });
      } else {
        setIsUndoAction(false);
        setIsRedoAction(false);
      }
    },
    [isUndoAction, isRedoAction]
  );

  const onSelectionChanged = useCallback(() => {
    const selectedNodes = gridRef.current.api.getSelectedNodes();
    if (selectedNodes.length > 1) {
      setNodesSelected(selectedNodes);
    } else {
      setNodesSelected([]);
    }
  }, []);

  const handleUndoLastEdit = () => {
    if (undos.length === 0) return;
    setIsUndoAction(true);

    // Push this last edit into the redo stack
    const newUndos = [...undos];
    const lastEdit = newUndos.pop();

    setUndos(newUndos);

    const newRedos = [
      ...redos,
      {
        rowId: lastEdit.rowId,
        field: lastEdit.field,
        audiotrack: lastEdit.audiotrack,
        oldValue: lastEdit.newValue,
        newValue: lastEdit.oldValue
      }
    ];
    setTimeout(() => setRedos(newRedos));

    const rowNode = gridRef.current.api.getRowNode(lastEdit.rowId);
    rowNode.setDataValue(lastEdit.field, lastEdit.oldValue);
  };

  const handleRedoLastEdit = () => {
    if (redos.length === 0) return;
    setIsRedoAction(true);

    const newRedos = [...redos];
    const lastRedo = newRedos.pop();
    setRedos(newRedos);

    const newUndos = [
      ...undos,
      {
        rowId: lastRedo.rowId,
        field: lastRedo.field,
        audiotrack: lastRedo.audiotrack,
        oldValue: lastRedo.newValue,
        newValue: lastRedo.oldValue
      }
    ];
    setUndos(newUndos);

    const rowNode = gridRef.current.api.getRowNode(lastRedo.rowId);
    rowNode.setDataValue(lastRedo.field, lastRedo.oldValue);
  };

  const handleCancel = () => {
    gridRef.current.api.undoCellEditing();
  };

  const updateTags = async (arr) => {
    await window.metadataEditingApi.updateTags(arr);
  };

  const handleGridMenu = (e) => {
    switch (e.target.id) {
      case 'cancel-all':
        return handleCancel();
      case 'save-all':
        if (undos.length === 0) return;

        const updatesByRow = undos.reduce((acc, undo) => {
          if (!acc[undo.rowId]) {
            acc[undo.rowId] = { id: undo.audiotrack, track_id: undo.rowId, changes: {} };
          }
          acc[undo.rowId].changes[undo.field] = undo.newValue;

          return acc;
        }, {});
        const saveAll = Object.values(updatesByRow).map((row) => ({
          id: row.id,
          track_id: row.track_id,
          updates: row.changes
        }));
        return updateTags(saveAll);
      case 'undo-last':
        return handleUndoLastEdit();
      case 'redo-last':
        return handleRedoLastEdit();
      case 'deselect-all':
        return deselectAll();
      case 'theme':
        theme === 'dark'
          ? setThemeScheme(colorSchemeDarkBlue)
          : setThemeScheme(colorSchemeLightWarm);
        break;
      default:
        return;
    }
  };

  const defaultColDef = useMemo(
    () => ({ resizable: true, sortable: true, editable: (params) => !params.data.error }),
    []
  );

  const rowSelectionConfig = useMemo(
    () => ({ enableClickSelection: false, enableSelectionWithoutKeys: true, mode: 'multiRow' }),
    []
  );

  const updateHiddenColumns = useCallback(() => {
    if (!gridRef.current.api.getColumns()) return;
    const hiddenCols = gridRef.current.api.getColumns().filter((col) => !col.isVisible());
    setHiddenColumns(hiddenCols.map((col) => col.getColId()));
  }, [gridRef]);

  const onRowClicked = useCallback((event) => {
    if (event.ctrlKey || event.metaKey) {
      event.node.setSelected(!event.node.isSelected());
    }
  }, []);

  const handleCellContextMenu = useCallback((params) => {
    params.event.preventDefault();
    const allowedColumns = ['pictures', 'picture-location'];
    console.log('column: ', params.column.getColId());
    if (!allowedColumns.includes(params.column.getColId())) {
      return window.metadataEditingApi.showContextMenu({}, 'tag-context-menu');
    }
    setPendingPictureEdit({ track_id: params.data.track_id, newValue: null });
    const album = params.data.album ? params.data.album : '';
    const artist = params.data.albumArtists
      ? params.data.albumArtists
      : params.data.performers
        ? params.data.performers
        : '';
    const path = params.data.audiotrack;
    window.metadataEditingApi.showContextMenu({ artist, album, path }, 'picture');
  }, []);

  const onColumnVisible = useCallback(() => {
    if (gridRef.current?.api) {
      updateHiddenColumns(gridRef.current.api);
    }
  }, [updateHiddenColumns]);

  useEffect(() => {
    if (!tagReport || !tagReport.failed?.length) return;

    const interval = setInterval(() => {
      const columnApi = gridRef.current?.columnApi;
      const columnState = columnApi?.getColumnState();
      /* console.log('---------> ', columnState); */
      const failedSortColExists = columnState?.some((col) => col.colId === 'failedSort');

      if (failedSortColExists) {
        columnApi.applyColumnState({
          state: [{ colId: 'failedSort', sort: 'asc' }],
          defaultState: { sort: null }
        });
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [tagReport]);

  const rowClassRules = useMemo(() => {
    return {
      'row-failed': (params) => {
        return failedIds.includes(params.data.audiotrack);
      }
      /*  'row-warnings': (params) => {
        return params.data.tagWarnings === 1;
      } */
    };
  }, [failedIds]);

  const deselectAll = useCallback(() => {
    gridRef.current.api.deselectAll();
    setNodesSelected([]);
  }, []);

  const gridClassName = classNames('gridWrapper', {
    'no-panel': !isPanelVisible,
    'two-column': numNodes > 1
  });

  const editFormClassname = classNames(`edit-form ${theme}`, {
    'no-panel': !isPanelVisible,
    hidden: numNodes <= 1
  });

  return (
    <>
      <CustomToolPanel
        onChange={handleColumnPanel}
        /* setAllColumnsVisible={setAllColumnsVisible} */
        onClick={handleGridMenu}
        nodesSelected={nodesSelected}
        hiddenColumns={hiddenColumns}
        isPanelVisible={isPanelVisible}
        togglePanelVisibility={togglePanelVisibility}
        undos={undos.length}
        tagReport={tagReport}
        setTagReport={setTagReport}
      />

      {nodesSelected.length > 1 && (
        <div className={editFormClassname}>
          <EditForm
            handleCellContextMenu={handleCellContextMenu}
            onUpdate={handleMultiRowUpdate}
            nodesSelected={nodesSelected}
            hiddenColumns={hiddenColumns}
            getSelectedNodes={selectedNodesImagePicker}
          />
        </div>
      )}

      <div className={gridClassName} style={{ width: '100%', height: '100%' }}>
        <AgGridReact
          ref={gridRef}
          /*  debug={true} */
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onSelectionChanged={onSelectionChanged}
          columnTypes={columnTypes}
          components={components}
          getRowId={getRowId}
          theme={myTheme}
          onGridReady={onGridReady}
          rowSelection={rowSelectionConfig}
          autoSizeStrategy="fitCellContents"
          onCellValueChanged={handleCellValueChanged}
          onColumnVisible={onColumnVisible}
          undoRedoCellEditing={false}
          rowDragManaged={true}
          rowDragMultiRow={true}
          onRowClicked={onRowClicked}
          loading={loading}
          loadingOverlayComponent={() => <CustomLoadingOverlay />}
          noRowsOverlayComponent={() => <CustomNoRowsOverlay />}
          maintainColumnOrder={true}
          headerHeight={50}
          accentedSort={true}
          multiSortKey="ctrl"
          suppressMaintainUnsortedOrder={true}
          onCellContextMenu={handleCellContextMenu}
          rowClassRules={rowClassRules}
        />
      </div>
    </>
  );
};

export default AGGrid;
