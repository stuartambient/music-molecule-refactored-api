import useIpcEvent from './hooks/useIpcEvent';
import { useAudioPlayer } from './mainAudioContext';
import { requestMusicTracks } from './utility/musicRequests';

export function ContextMenuListener({ children }) {
  const { state, dispatch } = useAudioPlayer();

  useIpcEvent('context-menu-command', ({ command, context }) => {
    console.log('command: ', command, 'context: ', context);
    if (!context) return;
    handleContextMenuCommand(command, context, state, dispatch);
  });

  return children;
}

async function handleContextMenuCommand(command, item, state, dispatch) {
  console.log('command: ', command);
  switch (command) {
    case 'add-track-to-playlist': {
      const track = state.tracks.find((t) => t.track_id === item.id);
      if (track) {
        const alreadyInPlaylist = state.playlistTracks.find((e) => e.track_id === item.id);
        if (!alreadyInPlaylist) {
          const available = await requestMusicTracks(
            'prepare-music-tracks',
            [{ tracks: [track] }],
            dispatch,
            'Add track to Playlist'
          );
          if (!available?.length) return;
          dispatch({
            type: 'track-to-playlist',
            playlistTracks: available
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
        const albumTracks = await requestMusicTracks(
          'prepare-music-tracks',
          [{ album: item.path }],
          dispatch,
          'Add album to Playlist'
        );
        if (!albumTracks?.length) return;

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
      window.ipcApi.openAlbumFolder(item.path);
      break;
    default:
      console.warn('Unknown command:', command);
  }
}
