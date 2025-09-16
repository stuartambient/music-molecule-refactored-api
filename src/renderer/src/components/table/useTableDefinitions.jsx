import { useMemo } from 'react';
/* import { useColumnTypes } from './useColumnTypes'; */
/* import PlayButtonRenderer from './PlayButtonRenderer';
import { CiPlay1 } from 'react-icons/ci'; */
//Column state properties in the column definition are no longer parsed to number/boolean. Provide the correct types instead of string
// somewhere utils/tags.js
const useColumnDefinitions = (failedIds, failedErrorMap) => {
  const columnDefs = useMemo(
    () => [
      {
        headerName: '#',
        valueGetter: (params) => params.node.rowIndex + 1,
        width: 60,
        pinned: 'left',
        suppressMovable: true,
        sortable: false,
        filter: false
      },
      {
        field: 'status',
        headerName: 'Status',
        hide: failedIds.length > 0 ? false : true,
        valueGetter: (params) => {
          return failedErrorMap.get(params.data.audiotrack) || '';
        },
        cellClass: (params) => (failedIds.includes(params.data.audiotrack) ? 'row-failed' : '')
        /* cellClass: (params) => {
          return passedIds.includes(params.data.audiotrack) ? 'cell-passed' : '';
        } */
      },
      {
        field: 'failedSort',
        headerName: 'Failed Sort',
        hide: true,
        sortable: true,
        comparator: (a, b, nodeA, nodeB) => {
          const aFailed = failedIds.includes(nodeA.data.audiotrack);
          const bFailed = failedIds.includes(nodeB.data.audiotrack);
          return aFailed === bFailed ? 0 : aFailed ? -1 : 1;
        }
      },
      {
        field: 'playing',
        width: 20,
        editable: false,
        suppressMovable: true,
        resizable: false,
        headerName: 'Play',
        cellRenderer: 'PlayButtonRenderer'
      },
      /* { field: 'select', checkboxSelection: true, maxWidth: 20, resizable: false }, */
      {
        field: 'audiotrack',
        headerName: 'Audiotrack',
        //checkboxSelection: true,
        suppressMovable: true,
        filter: true,
        editable: true,
        width: 140,
        minWidth: 140,
        rowDrag: true
      },
      { field: 'title', filter: true },
      { field: 'performers', filter: true },
      { field: 'performersRole' },
      { field: 'albumArtists', filter: true },
      { field: 'album', filter: true },
      {
        field: 'year',
        filter: 'agNumberColumnFilter',
        type: 'numericColumn',
        valueSetter: (params) => {
          const newValue = Number(params.newValue);
          if (!isNaN(newValue) && params.data.year !== newValue) {
            params.data.year = newValue;
            return true; // Indicate the value has been updated
          }
          return false; // No valid update occurred
        }
      },
      { field: 'genres', filter: true /* editable: (params) => !params.data.error */ },
      { field: 'composers', filter: true },
      { field: 'conductor', filter: true },
      {
        field: 'comment'
      },
      { field: 'description' },
      { field: 'disc' },
      { field: 'discCount' },
      { field: 'track' },
      { field: 'trackCount' },
      { field: 'isCompilation', type: 'bool' },
      { field: 'publisher' },
      { field: 'isrc' },
      { field: 'copyright', filter: true },
      { field: 'pictures', type: 'bool', editable: false },
      { field: 'picture-location' /* , editable: true  */ },
      {
        field: 'duration',
        headerName: 'Duration',
        editable: false,
        valueFormatter: (params) => {
          const ms = Number(params.value);
          if (isNaN(ms)) return '';

          const totalSeconds = Math.floor(ms / 1000);
          const hours = Math.floor(totalSeconds / 3600);
          const minutes = Math.floor((totalSeconds % 3600) / 60);
          const seconds = totalSeconds % 60;

          const pad = (n) => n.toString().padStart(2, '0');
          return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
        }
      },
      { field: 'beatsPerMinute', filter: true },
      { field: 'lyrics' },
      { field: 'remixedBy' },
      { field: 'like', editable: false, type: 'bool' },
      {
        field: 'error',
        filter: true,
        editable: false,
        cellStyle: (params) => {
          return params.value ? { backgroundColor: 'red', color: 'white' } : null;
        }
      },
      { field: 'audioBitrate', filter: true, editable: false },
      { field: 'audioSampleRate', filter: true, editable: false },
      { field: 'codecs', filter: true, editable: false },
      { field: 'tagTypes', headerName: 'Tags', editable: false },
      { field: 'encoder', headerName: 'Encoder', editable: true },
      { field: 'encoderSettings', headerName: 'EncoderSettings', editable: true },
      { field: 'encodedBy', headerName: 'EncodedBy', editable: true },
      {
        field: 'tagWarnings',
        headerName: 'tagWarnings',
        type: 'bool',
        editable: false
        /* cellClass: (params) => (params.data.tagWarnings === 1 ? 'row-warnings' : '') */
      },

      { field: 'replayGainAlbumGain', hide: true },
      { field: 'replayGainAlbumPeak', hide: true },
      { field: 'replayGainTrackGain', hide: true },
      { field: 'replayGainTrackPeak', hide: true },
      {
        field: 'modified',
        editable: false,
        valueFormatter: (params) => {
          const value = params.value;
          if (!value) return '';

          // Convert epoch seconds (with decimals) to milliseconds
          const date = new Date(value);
          return date.toLocaleString(); // or use .toISOString() if you prefer
        }
      },
      { field: 'created_datetime', editable: false }
    ],
    [failedIds, failedErrorMap]
  );
  return columnDefs;
};

export { useColumnDefinitions };
