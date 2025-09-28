import useIpcEvent from './hooks/useIpcEvent';
import { useAudioPlayer } from './mainAudioContext';

export function ContextMenuListener({ children }) {
  const { state, dispatch } = useAudioPlayer();

  useIpcEvent('context-menu-command', ({ command, context }) => {
    console.log('command: ', command, 'context: ', context);
    if (!context) return;
    handleContextMenuCommand(command, context, state, dispatch);
  });

  return children;
}

function handleContextMenuCommand(command, item, state, dispatch) {
  console.log('command: ', command);
  switch (command) {
    case 'add-track-to-playlist': {
      const track = state.tracks.find((t) => t.track_id === item.id);
      if (track) {
        const alreadyInPlaylist = state.playlistTracks.find((e) => e.track_id === item.id);
        if (!alreadyInPlaylist) {
          dispatch({
            type: 'track-to-playlist',
            playlistTracks: [...state.playlistTracks, track]
          });
          dispatch({
            type: 'flash-div',
            flashDiv: item
          });
        }
      }
      break;
    }
    case 'edit-track-metadata': {
      console.log('edit track metadata');
      break;
    }
    case 'add-album-to-playlist': {
      const getAlbumTracks = async () => {
        const albumTracks = await window.ipcApi.invoke('get-album-tracks', item.path);
        if (!albumTracks) return console.log('no tracks associated with album');

        dispatch({ type: 'play-album', playlistTracks: albumTracks });
        const diff = albumTracks.filter(
          (p) => !state.playlistTracks.find((d) => d.track_id === p.track_id)
        );
        if (diff.length > 0) {
          dispatch({
            type: 'flash-div',
            flashDiv: item
          });
        }
      };
      getAlbumTracks();
      break;
    }
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
