import { useMemo } from 'react';
/* import RescanButtonRenderer from './RescanButtonRenderer'; */
/* import { useColumnTypes } from './useColumnTypes'; */
/* import PlayButtonRenderer from './PlayButtonRenderer';

import { CiPlay1 } from 'react-icons/ci'; */
//Column state properties in the column definition are no longer parsed to number/boolean. Provide the correct types instead of string
// somewhere utils/tags.js
const useColumnDefinitions = (/* failedIds, failedErrorMap */) => {
  /*  console.log('failed ids: ', failedIds, 'failedErrorMap: ', failedErrorMap); */
  const columnDefs = useMemo(
    () => [
      {
        colId: '#',
        headerName: '#',
        valueGetter: (params) => params.node.rowIndex + 1,
        width: 60,
        pinned: 'left',
        suppressMovable: true,
        sortable: false,
        filter: false
      },
      /*     {
        colId: 'status',
        field: 'status',
        headerName: 'Status',
        hide: failedIds.length > 0 ? false : true,
        valueGetter: (params) => {
          return failedErrorMap.get(params.data.audiotrack) || '';
        },
        cellClass: (params) => (failedIds.includes(params.data.audiotrack) ? 'row-failed' : '')

      }, */
      /*    {
        colId: 'failedSort',
        field: 'failedSort',
        headerName: 'Failed Sort',
        hide: true,
        sortable: true,
        comparator: (a, b, nodeA, nodeB) => {
          const aFailed = failedIds.includes(nodeA.data.audiotrack);
          const bFailed = failedIds.includes(nodeB.data.audiotrack);
          return aFailed === bFailed ? 0 : aFailed ? -1 : 1;
        }
      }, */
      {
        colId: 'playing',
        field: 'playing',
        width: 20,
        editable: false,
        suppressMovable: true,
        resizable: false,
        headerName: 'Play',
        cellRenderer: 'playButtonRenderer'
      },
      /* { field: 'select', checkboxSelection: true, maxWidth: 20, resizable: false }, */
      {
        colId: 'audiotrack',
        field: 'audiotrack',
        headerName: 'Audiotrack',
        //checkboxSelection: true,
        suppressMovable: true,
        filter: true,
        editable: true,
        width: 1000,
        minWidth: 140,
        rowDrag: true,
        valueSetter: (params) => {
          // Reject all edits (or add conditional logic here)
          return false;
        }
      },
      { colId: 'title', field: 'title', filter: true },
      { colId: 'performers', field: 'performers', filter: true },
      { colId: 'performersRole', field: 'performersRole' },
      { colId: 'albumArtists', field: 'albumArtists', filter: true },
      { colId: 'album', field: 'album', filter: true },
      {
        colId: 'year',
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
      {
        colId: 'genres',
        field: 'genres',
        filter: true /* editable: (params) => !params.data.error */
      },
      { colId: 'composers', field: 'composers', filter: true },
      { colId: 'conductor', field: 'conductor', filter: true },
      {
        colId: 'comment',
        field: 'comment'
      },
      { colId: 'description', field: 'description' },
      { colId: 'disc', field: 'disc' },
      { colId: 'discCount', field: 'discCount' },
      { colId: 'track', field: 'track' },
      { colId: 'trackCount', field: 'trackCount' },
      { colId: 'isCompilation', field: 'isCompilation', type: 'bool' },
      { colId: 'publisher', field: 'publisher' },
      { colId: 'isrc', field: 'isrc' },
      { colId: 'copyright', field: 'copyright', filter: true },
      { colId: 'pictures', field: 'pictures', type: 'bool', editable: false },
      { colId: 'picture-location', field: 'picture-location' /* , editable: true  */ },
      {
        colId: 'duration',
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
      { colId: 'beatsPerMinute', field: 'beatsPerMinute', filter: true },
      { colId: 'lyrics', field: 'lyrics' },
      { colId: 'remixedBy', field: 'remixedBy' },
      { colId: 'like', field: 'like', editable: false, type: 'bool' },
      {
        colId: 'error',
        field: 'error',
        editable: true,
        filter: false,
        /* valueGetter: () => 1, // force cell creation */
        headerName: 'Track Error',
        cellRenderer: 'rescanButtonRenderer'
      },
      /*       {
        colId: 'error',
        field: 'error',
        filter: true,
        editable: false,
        cellStyle: (params) => {
          return params.value ? { backgroundColor: 'red', color: 'white' } : null;
        }
      }, */
      { colId: 'audioBitrate', field: 'audioBitrate', filter: true, editable: false },
      { colId: 'audioSampleRate', field: 'audioSampleRate', filter: true, editable: false },
      { colId: 'codecs', field: 'codecs', filter: true, editable: false },
      { colId: 'tagTypes', field: 'tagTypes', headerName: 'Tags', editable: false },
      { colId: 'encoder', field: 'encoder', headerName: 'Encoder', editable: true },
      {
        colId: 'encoderSettings',
        field: 'encoderSettings',
        headerName: 'EncoderSettings',
        editable: true
      },
      { colId: 'encodedBy', field: 'encodedBy', headerName: 'EncodedBy', editable: true },
      {
        colId: 'tagWarnings',
        field: 'tagWarnings',
        headerName: 'tagWarnings',
        type: 'bool',
        editable: false
        /* cellClass: (params) => (params.data.tagWarnings === 1 ? 'row-warnings' : '') */
      },

      { colId: 'replayGainAlbumGain', field: 'replayGainAlbumGain', hide: true },
      { colId: 'replayGainAlbumPeak', field: 'replayGainAlbumPeak', hide: true },
      { colId: 'replayGainTrackGain', field: 'replayGainTrackGain', hide: true },
      { colId: 'replayGainTrackPeak', field: 'replayGainTrackPeak', hide: true },
      {
        colId: 'modified',
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
      { colId: 'created_datetime', field: 'created_datetime', editable: false }
    ],
    []
  );
  return columnDefs;
};

export { useColumnDefinitions };
