import { useMemo } from 'react';

const useColumnTypes = () => {
  const columnTypes = useMemo(() => {
    return {
      bool: {
        cellRenderer: (params) => <span>{params.value === 1 ? 'true' : 'false'}</span>,
        cellEditor: 'agSelectCellEditor',
        cellEditorParams: {
          values: [0, 1] // Use strings for display in the select element
        },
        valueFormatter: (params) => (params.value === 1 ? 'true' : 'false'),
        valueParser: (params) => (params.newValue === 'true' ? 1 : 0)
        //editable: true
      }
    };
  }, []);
  return columnTypes;
};

export { useColumnTypes };
