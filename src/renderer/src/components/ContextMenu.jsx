import { useRef } from 'react';
import { useAudioPlayer } from '../mainAudioContext';
import useIpcEvent from '../hooks/useIpcEvent';
import { BsThreeDots } from 'react-icons/bs';
import '../style/FlashEffect.css';

const ContextMenu = ({ fromlisttype, id, fullpath = undefined }) => {
  /* console.log('fullpath: ', fullpath); */
  /*  console.log(fromlisttype, '---', id, '----', fullpath); */
  const { state, dispatch } = useAudioPlayer();
  /*   const [contextMenuItem, setContextMenuItem] = useState(null); */
  const divRef = useRef(null);

  /*  useIpcEvent('context-menu-command', handleContextMenuCommand); */

  function handleAddTrackToPlaylist(context) {
    const track = state.tracks.find((item) => item.track_id === context.id);
    if (track) {
      const alreadyInPlaylist = state.playlistTracks.find((e) => e.track_id === context.id);
      if (!alreadyInPlaylist) {
        dispatch({
          type: 'track-to-playlist',
          playlistTracks: [...state.playlistTracks, track]
        });
        dispatch({
          type: 'flash-div',
          flashDiv: context
        });
      }
    }
  }

  function handleEditTrackMetadata(context) {
    console.log('---> Editing track metadata', context);
  }

  function handleAddAlbumToPlaylist(context) {
    const getAlbumTracks = async () => {
      const albumTracks = await window.ipcApi.invoke('get-album-tracks', context.path);
      dispatch({
        type: 'play-album',
        playlistTracks: albumTracks
      });

      const diff = albumTracks.filter(
        (p) => !state.playlistTracks.find((d) => d.track_id === p.track_id)
      );
      if (diff.length > 0) {
        dispatch({
          type: 'flash-div',
          flashDiv: context
        });
      }
    };
    getAlbumTracks();
  }

  function handleRemoveFromPlaylist(context) {
    dispatch({
      type: 'remove-track',
      id: context.id
    });
  }

  function handleOpenAlbumFolder(context) {
    window.api.openAlbumFolder(context.path);
  }

  useIpcEvent('context-menu-command', ({ command, context }) => {
    switch (command) {
      case 'add-track-to-playlist':
        return handleAddTrackToPlaylist(context);
      case 'edit-track-metadata':
        return handleEditTrackMetadata(context);
      case 'add-album-to-playlist':
        return handleAddAlbumToPlaylist(context);
      case 'remove-from-playlist':
        return handleRemoveFromPlaylist(context);
      case 'open-album-folder':
        return handleOpenAlbumFolder(context);
      default:
        console.warn('Unknown command:', command);
    }
  });

  /*   useEffect(() => {
    if (!contextMenuItem) return;

    const handleContextMenuCommand = (command) => {
      console.log('command: ', command, 'contextMenuItem: ', contextMenuItem);
      switch (command) {
        case 'add-track-to-playlist': {
          const track = state.tracks.find((item) => item.track_id === contextMenuItem.id);
          if (track) {
            const alreadyInPlaylist = state.playlistTracks.find(
              (e) => e.track_id === contextMenuItem.id
            );
            if (!alreadyInPlaylist) {
              dispatch({
                type: 'track-to-playlist',
                playlistTracks: [...state.playlistTracks, track]
              });
              dispatch({
                type: 'flash-div',
                flashDiv: contextMenuItem
              });
            }
          }
          break;
        }
        case 'edit-track-metadata': {
          console.log('---> Editing track metadata');
          break;
        }
        case 'add-album-to-playlist': {
          const getAlbumTracks = async () => {
            const albumTracks = await window.ipcApi.invoke(
              'get-album-tracks',
              contextMenuItem.path
            );
            dispatch({
              type: 'play-album',
              playlistTracks: albumTracks
            });

            const diff = albumTracks.filter(
              (p) => !state.playlistTracks.find((d) => d.track_id === p.track_id)
            );
            if (diff.length > 0) {
              dispatch({
                type: 'flash-div',
                flashDiv: contextMenuItem
              });
            }
          };
          getAlbumTracks();
          break;
        }
        case 'remove-from-playlist': {
          dispatch({
            type: 'remove-track',
            id: contextMenuItem.id
          });
          break;
        }
        case 'open-album-folder': {
          window.api.openAlbumFolder(contextMenuItem.path);
          break;
        }
        default: {
          console.warn('Unknown command:', command);
          break;
        }
      }
    };

    const cleanup = window.api.onContextMenuCommand(handleContextMenuCommand);

    return () => {
      if (cleanup) cleanup();
    };
  }, [contextMenuItem, state.tracks, state.playlistTracks, dispatch]); */

  const handleContextMenu = async (e) => {
    e.preventDefault();
    const id = divRef.current.id;
    const type = divRef.current.dataset.type;
    const path = divRef.current.dataset.path;

    /* console.log(id, type, path); */
    /*     setContextMenuItem(null);
    if (path) {
      setContextMenuItem({ id, type, path });
    } else {
      setContextMenuItem({ id, type });
    } */
    window.ipcApi.send('show-context-menu', id, type, path);
  };

  return (
    <div
      id={id}
      data-type={fromlisttype}
      data-path={fullpath}
      onClick={handleContextMenu}
      style={{ display: 'flex', alignItems: 'center' }}
      ref={divRef}
    >
      <BsThreeDots />
    </div>
  );
};

export default ContextMenu;
