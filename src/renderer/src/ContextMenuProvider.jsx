import { useState } from 'react';
import { ContextMenuContext } from './ContextMenuContext';
import useIpcEvent from './hooks/useIpcEvent';

export function ContextMenuProvider({ state, dispatch, children }) {
  const [contextMenuItem, setContextMenuItem] = useState(null);

  useIpcEvent('context-menu-command', (command) => {
    if (!contextMenuItem) return;
    handleContextMenuCommand(command, contextMenuItem, state, dispatch);
  });

  return (
    <ContextMenuContext.Provider value={{ setContextMenuItem }}>
      {children}
    </ContextMenuContext.Provider>
  );
}

function handleContextMenuCommand(command, item, state, dispatch) {
  switch (command) {
    case 'add-track-to-playlist': {
      const track = state.tracks.find((t) => t.track_id === item.id);
      if (track) {
        dispatch({ type: 'track-to-playlist', playlistTracks: [...state.playlistTracks, track] });
      }
      break;
    }
    case 'edit-track-metadata': {
      console.log('edit track metadata');
      break;
    }
    case 'add-album-to-playlist':
      window.ipcApi.invoke('get-album-tracks', item.path).then((albumTracks) => {
        dispatch({ type: 'play-album', playlistTracks: albumTracks });
      });
      break;
    case 'remove-from-playlist':
      dispatch({ type: 'remove-track', id: item.id });
      break;
    case 'open-album-folder':
      window.ipcApi.invoke('open-album-folder', item.path);
      break;
    default:
      console.warn('Unknown command:', command);
  }
}
