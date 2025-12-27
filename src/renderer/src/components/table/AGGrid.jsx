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
import useIpcEvent from '../../hooks/useIpcEvent';
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

  const [tempFolder, setTempFolder] = useState(null);
  const [tagReport, setTagReport] = useState({ result: '', passed: [], failed: [] });
  const [pendingPictureEdit, setPendingPictureEdit] = useState({});

  const gridRef = useRef(null);
  const [undos, setUndos] = useState([]);
  const [redos, setRedos] = useState([]);

  const { theme } = useTheme();
  const failedIds = useMemo(() => tagReport?.failed?.map((item) => item.id) || [], [tagReport]);
  const failedErrorMap = useMemo(() => {
    return new Map(tagReport.failed.map(({ id, error }) => [id, error || 'Unknown error']));
  }, [tagReport]);

  const FILTER_CONTEXT_MENU_COLS = ['audiotrack', 'album', 'performers'];

  const columnDefs = useColumnDefinitions(failedIds, failedErrorMap);
  const columnTypes = useColumnTypes();
  const components = useMemo(() => ({ PlayButtonRenderer }), []);

  useEffect(() => {
    theme === 'dark' ? setThemeScheme(colorSchemeDarkBlue) : setThemeScheme(colorSchemeLightWarm);
  }, [theme]);

  const insertData = (data) => {
    setRowData(data);
  };

  const handleSendToChild = (e) => {
    setLoading(false);
    setListType(e.listType);
    insertData(e.results);
    setReset(false);
  };

  useIpcEvent('send-to-child', handleSendToChild, 'tagEditApi');

  const myTheme = useMemo(() => {
    return themeQuartz
      .withParams({ spacing: 12, fontSize: 16, headerFontWeight: 600 })
      .withPart(themeScheme);
  }, [themeScheme]);

  /*   useEffect(() => {
    const loadPreferences = async () => {
      const preferences = await window.tagEditApi.invoke('get-preferences-sync');
      setHiddenColumns(preferences.grids.tagEdit.columns || []);
    };
    loadPreferences();
  }, []); */

  /*   useEffect(() => {
    const updateColPrefs = async () => {
      await window.tagEditApi.invoke('save-preferences', { hiddenColumns });
    };

    if (hiddenColumns.length > 0) {
      updateColPrefs();
    }
  }, [hiddenColumns]); */

  /*   useEffect(() => {
    if (prefsLoaded && gridRef.current?.api) {
      const gridApi = gridRef.current.api;
      if (Array.isArray(hiddenColumns) && hiddenColumns.length > 0) {
        gridApi.setColumnsVisible(hiddenColumns, false); // Pass the array directly
      }
    }
  }, [prefsLoaded, hiddenColumns]); */

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

  function onFilterContextMenu(e) {
    e.preventDefault();

    if (!(e.target instanceof HTMLInputElement)) return;

    e.preventDefault();

    window.tagEditApi.send('show-context-menu', {}, 'tag-context-menu');
  }

  useEffect(() => {
    console.log('undos: ', undos);
  }, [undos]);

  useEffect(() => {
    if (rowData && rowData.length > 0) {
      resetAudio();
      setUndos([]);
      setRedos([]);
      setNodesSelected([]);
    }
  }, [rowData]);

  useEffect(() => {
    setNumNodes(nodesSelected.length);
  }, [nodesSelected]);

  const onGridReady = async (params) => {
    gridRef.current.api = params.api; // Attach the grid API to the ref
    /*  const columnState = gridRef.current.api.getColumnState();
    const hiddenCols = columnState.filter((col) => !col.hide);
    console.log('hiddenCols: ', hiddenCols); */
    setGridReady(true);

    const prefs = await window.tagEditApi.invoke('get-preferences-sync');

    const state = prefs?.grids?.tagEdit?.columns;

    console.log('state: ', state);

    if (state?.length) {
      params.api.applyColumnState({
        state,
        applyOrder: true
      });
    }
    queueMicrotask(() => {
      syncHiddenColumns();
    });

    params.api.addEventListener('filterOpened', (e) => {
      /* if (e.column?.getColId() !== 'audiotrack') return;
       */
      const colId = e.column?.getColId();
      if (!colId || !FILTER_CONTEXT_MENU_COLS.includes(colId)) return;
      // Let the popup render
      requestAnimationFrame(() => {
        const filterGui = document.querySelector('.ag-filter');
        if (!filterGui) return;

        // Avoid double-binding
        if (filterGui.__hasContextMenu) return;
        filterGui.__hasContextMenu = true;

        filterGui.addEventListener('contextmenu', onFilterContextMenu);

        /* filterGui.addEventListener('contextmenu', onFilterContextMenu); */
      });
    });
  };

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

  const onColumnChanged = useCallback(() => {
    if (!gridRef.current?.api) return;

    const columnState = gridRef.current.api.getColumnState();

    console.log('column state: ', columnState);
  }, []);

  useIpcEvent(
    'context-menu-command',
    (values) => {
      let artist, title, path;
      const { type, params } = values;

      if (type === 'single-track') {
        artist = params.artist;
        title = params.album;
        path = params.path;
      } else if (type === 'search-folder-single') {
        setTempFolder(params.path);
        return;
      }

      openChildWindow(
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
    },
    'tagEditApi'
  );

  const handleTagUpdateStatus = (val) => {
    switch (val.status) {
      case 'success':
        return setUndos([]);

      case 'partial_status':
        break;
      case 'failed': {
        const currentFailedIds = new Set(val.failed.map((f) => f.id));
        const retainedUndos = undos.filter((u) => currentFailedIds.has(u.audiotrack));
        setUndos(retainedUndos);
        break;
      }
      default:
        break;
    }
  };

  useIpcEvent('updated-tags', handleTagUpdateStatus, 'tagEditApi');

  useEffect(() => {
    if (tempFolder) {
      window.tagEditApi.invoke('select-image-from-folder', tempFolder, true);
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

  const syncHiddenColumns = () => {
    const api = gridRef.current?.api;
    if (!api) return;

    setHiddenColumns(api.getColumnState());
  };

  const persistColumnState = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api) return;

    const state = api.getColumnState();

    window.tagEditApi.invoke('save-preferences', {
      grids: {
        tagEdit: {
          columns: state
        }
      }
    });
  }, []);

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

  useIpcEvent('for-submit-form', handleForSubmit, 'tagEditApi');
  useIpcEvent('save-image-folder', handleImageFolder, 'tagEditApi');

  const togglePanelVisibility = () => {
    setIsPanelVisible(!isPanelVisible);
  };

  const handleColumnPanel = (e) => {
    const gridApi = gridRef.current?.api;
    if (!gridApi) return;
    const { name: colId, checked } = e.target;
    console.log('handleColumnPanel:', colId, checked);

    gridApi.setColumnsVisible([colId], checked);
  };

  const handleMultiRowUpdate = (multiRowChanges) => {
    /* console.log('multirode changes: ', multiRowChanges); */
    const nodeMap = new Map();
    gridRef.current.api.forEachNodeAfterFilterAndSort((node) => {
      if (node.id != null) {
        nodeMap.set(node.id, node);
      }
    });

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

        /*   if (event.colDef.field === 'audiotrack') {
          return;
        } */
        const change = {
          rowId: node.id,
          field: event.colDef.field,
          audiotrack: event.data.audiotrack,
          newValue: event.newValue === '-' ? '-' : event.newValue,
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
    await window.tagEditApi.invoke('update-tags', arr);
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

  /*   const updateHiddenColumns = useCallback(() => {
    if (!gridRef.current.api.getColumns()) return;
    const hiddenCols = gridRef.current.api.getColumns().filter((col) => !col.isVisible());
    setHiddenColumns(hiddenCols.map((col) => col.getColId()));
  }, [gridRef]); */

  const onRowClicked = useCallback((event) => {
    if (event.ctrlKey || event.metaKey) {
      event.node.setSelected(!event.node.isSelected());
    }
  }, []);

  const handleCellContextMenu = useCallback((params) => {
    params.event.preventDefault();
    const allowedColumns = ['pictures', 'picture-location'];
    /* console.log('column: ', params.column.getColId()); */
    if (!allowedColumns.includes(params.column.getColId())) {
      return window.tagEditApi.send('show-context-menu', {}, 'tag-context-menu');
    }
    setPendingPictureEdit({ track_id: params.data.track_id, newValue: null });
    const album = params.data.album ? params.data.album : '';
    const artist = params.data.albumArtists
      ? params.data.albumArtists
      : params.data.performers
        ? params.data.performers
        : '';
    const path = params.data.audiotrack;
    window.tagEditApi.send('show-context-menu', { artist, album, path }, 'picture');
  }, []);

  /*   const onColumnVisible = useCallback(() => {
    if (gridRef.current?.api) {
      updateHiddenColumns(gridRef.current.api);
    }
  }, [updateHiddenColumns]); */

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
        setUndos={setUndos}
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
          onColumnMoved={persistColumnState}
          onColumnVisible={() => {
            syncHiddenColumns();
            persistColumnState();
          }}
          onColumnResized={persistColumnState}
          onColumnPinned={persistColumnState}
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
