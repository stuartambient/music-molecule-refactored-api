const [hiddenColumns, setHiddenColumns] = useState([]);

const onGridReady = async (params) => {
  gridRef.current.api = params.api; // Attach the grid API to the ref
  const columnState = gridRef.current.api.getColumnState();
  const hiddenCols = columnState.filter((col) => !col.hide);
  console.log('hiddenCols: ', hiddenCols);
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
  syncHiddenColumns();
};

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

const handleColumnPanel = (e) => {
  const gridApi = gridRef.current?.api;
  if (!gridApi) return;
  const { name: colId, checked } = e.target;
  console.log('handleColumnPanel:', colId, checked);

  gridApi.setColumnsVisible([colId], checked);
};

<AgGridReact
          ref={gridRef}
          onGridReady={onGridReady}
          onColumnMoved={persistColumnState}
          onColumnVisible={syncHiddenColumns}
          onColumnResized={persistColumnState}
          onColumnPinned={persistColumnState}
