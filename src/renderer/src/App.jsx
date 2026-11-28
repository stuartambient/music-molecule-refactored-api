import { useEffect, useCallback, useState } from 'react';
import classNames from 'classnames';
import { useAudioPlayer } from './mainAudioContext';
import useIpcEvent from './hooks/useIpcEvent';
import { normalizeMainTheme } from '../../shared/themePreferences';

import PlaybackError from './components/PlaybackError';
import MusicNotice from './components/MusicNotice';
import Player from './components/Player';
import ArtworkView from './components/ArtworkView';
import InfiniteList from './components/InfiniteList';
import Home from './components/Home';
import Update from './components/Update';
import MainNav from './components/MainNav';
import Controls from './components/Controls';
import Extras from './components/Extras';
import Stats from './components/Stats';

import './App.css';
import './appstyles/mainThemes.css';

function App() {
  const { state, dispatch } = useAudioPlayer();
  const [artworkExpanded, setArtworkExpanded] = useState(false);
  const openArtwork = useCallback(async () => {
    setArtworkExpanded(true);
    try {
      const opened = await window.ipcApi.artworkView(true);
      if (!opened) setArtworkExpanded(false);
    } catch (error) {
      setArtworkExpanded(false);
      console.error('Unable to expand artwork:', error);
    }
  }, []);
  const closeArtwork = useCallback(async () => {
    try {
      await window.ipcApi.artworkView(false);
    } catch (error) {
      console.error('Unable to restore the previous window:', error);
    } finally {
      setArtworkExpanded(false);
    }
  }, []);

  const handleThemeUpdate = useCallback(async () => {
    const preferences = await window.ipcApi.getPreferences();
    const mainTheme = normalizeMainTheme(preferences?.mainTheme);

    if (mainTheme !== state.mainTheme) {
      console.log('not equal');
      dispatch({
        type: 'set-main-theme',
        mainTheme
      });
    }
  }, [state.mainTheme, dispatch]);

  // Run check when mainTheme changes
  useEffect(() => {
    handleThemeUpdate();
  }, [handleThemeUpdate]);

  const checkMainTheme = () => {
    handleThemeUpdate();
  };

  // Setup subscription once
  /*   useEffect(() => {
    window.api.onMainThemeUpdate(handleThemeUpdate);

    return () => {
      window.api.off('main-theme-updated', handleThemeUpdate);
    };
  }, [handleThemeUpdate]); */

  useIpcEvent('main-theme-updated', checkMainTheme);

  useIpcEvent('track-like-removed', handleLikeRemoved);
  useIpcEvent('track-liked', handleTrackLiked);

  function handleLikeRemoved(id) {
    console.log('track like removed', id);
    dispatch({
      type: 'update-like',
      isLiked: 0
    });
    dispatch({
      type: 'tracks-update-like',
      payload: {
        track_id: id,
        field: 'like',
        value: 0
      }
    });
  }

  function handleTrackLiked(id) {
    console.log('track liked', id);
    dispatch({
      type: 'update-like',
      isLiked: 1
    });
    dispatch({
      type: 'tracks-update-like',
      payload: {
        track_id: id,
        field: 'like',
        value: 1
      }
    });
  }

  useEffect(() => {
    let subscribed = true;
    const changeScreenMode = () => {
      if (state.minimalmode && state.player) {
        window.ipcApi.screenMode(state.miniModePlaylist ? 'mini-expanded' : 'mini');
      } else if (!state.minimalmode && state.player && state.library) {
        window.ipcApi.screenMode('player-library');
      } else if (state.player && !state.library) {
        window.ipcApi.screenMode('player');
      } else if (!state.player) {
        window.ipcApi.screenMode('default');
      }
    };
    if (subscribed) {
      changeScreenMode();
    }
    return () => (subscribed = false);
  }, [state.minimalmode, state.player, state.miniModePlaylist, state.library]);

  const handleUpdateLike = async (id) => {
    if (!id) return;
    /* await window.api.updateLike(id); */
    await window.ipcApi.updateLike(id);
  };

  const handlePlayerControls = (e) => {
    console.log('handlePlayerControls: ', e.currentTarget.id);
    switch (e.currentTarget.id) {
      case 'stop':
        dispatch({
          type: 'reset',
          pause: true
        });
        break;
      case 'playlist':
        dispatch({
          type: 'library'
        });
        break;
      case 'pauseplay':
        dispatch({
          type: 'pauseplay'
        });
        break;

      case 'backward':
        dispatch({ type: 'advance-track', direction: -1 });
        break;
      case 'forward':
        dispatch({ type: 'advance-track', direction: 1 });
        break;
      case 'like':
        handleUpdateLike(state.active);
        break;
      case 'shuffle':
        if (state.listType === 'files') {
          if (state.activeList === 'tracklistActive') {
            dispatch({ type: 'reset', pause: true, selectionList: 'tracklistActive' });
          }
          dispatch({
            type: 'tracks-shuffle',
            tracksShuffle: !state.tracksShuffle
          });
          dispatch({
            type: 'tracks-pagenumber',
            tracksPageNumber: 0
          });
          dispatch({
            type: 'reset-tracks',
            tracks: []
          });
        }
        if (state.listType === 'playlist') {
          dispatch({
            type: 'playlist-shuffle',
            playlistShuffle: !state.playlistShuffle
          });
        }

        break;
      case 'miniplayer':
        if (state.miniModePlaylist) {
          return dispatch({
            type: 'exit-mini-to-full',
            miniModePlaylist: !state.miniModePlaylist,
            minimalmode: !state.minimalmode
          });
        }
        if (state.library && !state.minimalmode) {
          return dispatch({
            type: 'enter-mini-from-fullplaylist',
            miniModePlaylist: true,
            minimalmode: true
          });
        }

        dispatch({
          type: 'player-minimode',
          minimalmode: !state.minimalmode,
          home: false,
          update: false,
          player: true
        });
        break;
      default:
        return;
    }
  };

  const handleWindowAction = (action) => {
    window.ipcApi.windowAction(action);
  };

  const handleMenu = () => {
    window.ipcApi.showContextMenu(1, 'menu');
  };

  const handleMainNav = async (e) => {
    if (state.setup) {
      dispatch({
        type: 'config-options',
        setup: ''
      });
    }
    switch (e.currentTarget.id) {
      case 'menu':
        handleMenu();
        break;
      case 'close':
        handleWindowAction('close');
        break;
      case 'minimize':
        handleWindowAction('minimize');
        break;
      case 'maximize':
        handleWindowAction('maximize');
        break;

      case 'albums':
        dispatch({
          type: 'set-page',
          home: true,
          update: false,
          player: false,
          library: false,
          tagEditor: false
        });
        break;
      case 'home':
        dispatch({
          type: 'set-page',
          home: true,
          update: false,
          player: false,
          library: false,
          tagEditor: false
        });
        break;
      case 'update':
        dispatch({
          type: 'set-page',
          home: false,
          update: true,
          player: false,
          library: false,
          tagEditor: false
        });
        break;
      case 'player':
        dispatch({
          type: 'set-page',
          home: false,
          update: false,
          player: true,
          library: false,
          tagEditor: false
        });
        break;
      case 'tag-editor':
        dispatch({
          type: 'set-page',
          home: false,
          update: false,
          player: false,
          library: false,
          tagEditor: true
        });
        break;
      case 'playerplaylist':
        dispatch({
          type: 'set-page',
          home: false,
          update: false,
          player: true,
          library: true,
          tagEditor: false
        });
        break;
      case 'mini-mode':
        if (state.miniModePlaylist) {
          return dispatch({
            type: 'exit-mini-to-full',
            miniModePlaylist: !state.miniModePlaylist,
            minimalmode: !state.minimalmode
          });
        }
        if (state.library && !state.minimalmode) {
          return dispatch({
            type: 'enter-mini-from-fullplaylist',
            miniModePlaylist: true,
            minimalmode: true
          });
        }

        dispatch({
          type: 'player-minimode',
          minimalmode: !state.minimalmode,
          home: false,
          update: false,
          player: true,
          tagEditor: false
        });

        break;
      case 'mini-mode-playlist':
        dispatch({
          type: 'mini-mode-playlist',
          miniModePlaylist: !state.miniModePlaylist,
          library: !state.library
        });
        break;
      case 'minimodeinfo':
        dispatch({
          type: 'mini-mode-info',
          minimalmodeInfo: !state.minimalmodeInfo
        });
        break;
      default:
        return;
    }
  };

  const containerClassNames = classNames(`container ${state.mainTheme}`, {
    'artwork-expanded': artworkExpanded,
    'container-home': state.home || state.tagEditor,
    'container-update': state.update,
    'container-mini-expanded': state.miniModePlaylist,
    'container-minimal': state.minimalmode && state.player,
    'container-maximized': state.maximized,
    'container-player':
      state.player && !state.minimalmode && !state.miniModePlaylist && state.library,
    'container-centered':
      state.player && !state.minimalmode && !state.miniModePlaylist && !state.library
  });

  return (
    <div className={containerClassNames}>
      {state.player && !state.library && !state.minimalmode ? null : (
        <MainNav onClick={handleMainNav} />
      )}
      {/* {state.home && !state.minimalmode && <Home />} */}
      <Home />
      {state.update && <Update />}
      {/*  open to all pages */}
      {state.player || state.home ? (
        <Player onExpandArtwork={openArtwork}>
          {!state.minimalmode && (
            <>
              <Controls handlePlayerControls={handlePlayerControls} />
              {!state.home && <Extras handlePlayerControls={handlePlayerControls} />}
            </>
          )}
        </Player>
      ) : null}
      {state.tagEditor && <Stats />}
      {state.minimalmode && <Controls handlePlayerControls={handlePlayerControls} />}

      {state.player || state.miniModePlaylist || state.home || state.update || state.tagEditor ? (
        <InfiniteList />
      ) : null}
      {artworkExpanded && <ArtworkView onExit={closeArtwork} onControl={handlePlayerControls} />}
      {/* Keep non-draggable notices after the window's draggable surfaces. */}
      <PlaybackError />
      <MusicNotice />
    </div>
  );
}

export default App;
