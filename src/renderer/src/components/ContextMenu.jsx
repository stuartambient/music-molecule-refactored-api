import { useRef } from 'react';
import { useAudioPlayer } from '../mainAudioContext';
import useIpcEvent from '../hooks/useIpcEvent';
import { BsThreeDots } from 'react-icons/bs';
import '../style/FlashEffect.css';

const ContextMenu = ({ fromlisttype, id, fullpath = undefined }) => {
  const { state, dispatch } = useAudioPlayer();
  const divRef = useRef(null);

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

  const handleContextMenu = async (e) => {
    e.preventDefault();
    const id = divRef.current.id;
    const type = divRef.current.dataset.type;
    const path = divRef.current.dataset.path;
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
