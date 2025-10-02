import { useEffect, useCallback } from 'react';
import classNames from 'classnames';
import { handleManualChange } from './utility/audioUtils';
import { useAudioPlayer } from './mainAudioContext';
import useIpcEvent from './hooks/useIpcEvent';

import { convertDuration } from './hooks/useTime';
import Player from './components/Player';
import InfiniteList from './Components/InfiniteList';
import Home from './Components/Home';
import Update from './Components/Update';
import MainNav from './Components/MainNav';
import Controls from './Components/Controls';
import Extras from './Components/Extras';
import Stats from './Components/Stats';

import './App.css';
import './appstyles/root.css';
import './appstyles/theme-1.css';
import './appstyles/theme-2.css';
import './appstyles/theme-3.css';
import './appstyles/theme-4.css';
import './appstyles/theme-5.css';

function App() {
  const { state, dispatch } = useAudioPlayer();

  const handleThemeUpdate = useCallback(async () => {
    const preferences = await window.ipcApi.invoke('get-preferences');

    if (preferences.mainTheme && preferences.mainTheme !== state.mainTheme) {
      console.log('not equal');
      dispatch({
        type: 'set-main-theme',
        mainTheme: preferences.mainTheme
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

  useEffect(() => {
    const audio = state.audioRef.current;

    const handleLoadedMetadata = (/* e */) => {
      dispatch({ type: 'duration', duration: convertDuration(audio) });
      dispatch({ type: 'set-delay', delay: true });
    };

    const handleError = (e) => {
      const { code, message } = e.target.error; // Note: Adjusted for potential cross-browser compatibility
      if (code === 3 && message === 'AUDIO_RENDERER_ERROR: audio render error') {
        console.log(code, message);
      }
      if (code === 4) {
        if (state.nextTrack) {
          handleManualChange(state.nextTrack, state, dispatch);
        }
      }
    };

    const handleSeeking = () => {
      dispatch({ type: 'seeking', seeking: true });
      setTimeout(() => dispatch({ type: 'seeking', seeking: false }), 2000);
    };

    const handleVolumeChange = () => {
      dispatch({ type: 'set-volume', volume: audio.volume });
    };

    const handleEnded = () => {
      dispatch({ type: 'direction', playNext: true });
      dispatch({ type: 'set-delay', delay: false });
    };

    audio.onloadedmetadata = handleLoadedMetadata;
    audio.onerror = handleError;
    audio.onseeking = handleSeeking;
    audio.onvolumechange = handleVolumeChange;
    audio.onended = handleEnded;

    return () => {
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.onseeking = null;
      audio.onvolumechange = null;
      audio.onended = null;
    };
  }, [state.audioRef, dispatch, state]);

  useEffect(() => {
    const audio = state.audioRef.current;
    if (!audio) return;

    const handleReady = () => {
      if (!state.pause) {
        audio.play().catch((err) => {
          console.error('play() failed:', err);
        });
      }
    };

    if (state.pause) {
      audio.pause();
    } else {
      // If already loaded, play immediately
      if (audio.readyState >= 2) {
        audio.play().catch(console.error);
      } else {
        audio.addEventListener('loadedmetadata', handleReady);
      }
    }

    return () => {
      audio.removeEventListener('loadedmetadata', handleReady);
    };
  }, [state.pause, state.audioRef]);

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
        window.ipcApi.send('screen-mode', state.miniModePlaylist ? 'mini-expanded' : 'mini');
        window.ipcApi.send('toggle-resizable', false);
      } else if (!state.minimalmode && state.player && state.library) {
        window.ipcApi.send('screen-mode', 'player-library');
        window.ipcApi.send('toggle-resizable', true);
      } else if (state.player && !state.library) {
        window.ipcApi.send('screen-mode', 'player');
        window.ipcApi.send('toggle-resizable', false);
      } else if (!state.player) {
        window.ipcApi.send('screen-mode', 'default');
        window.ipcApi.send('toggle-resizable', true);
      }
    };
    if (subscribed) {
      changeScreenMode();
    }
    return () => (subscribed = false);
  }, [state.minimalmode, state.player, state.miniModePlaylist, state.library]);

  const shouldReturn = (/* direction */) => {
    return (
      state.listType === 'albums' ||
      (state.listType === 'playlist' && state.playlistTracks.length === 0) ||
      (state.listType === 'files' && state.activeList === 'playlistActive') ||
      (state.listType === 'playlist' && state.activeList === 'tracklistActive')
    );
  };

  const handleUpdateLike = async (id) => {
    if (!id) return;
    /* await window.api.updateLike(id); */
    await window.ipcApi.invoke('update-like', id);
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
        if (shouldReturn('backward')) return;
        dispatch({
          type: 'direction',
          playNext: false,
          playPrev: true
        });
        break;
      case 'forward':
        if (shouldReturn('forward')) return;
        dispatch({
          type: 'direction',
          playPrev: false,
          playNext: true
        });
        break;
      case 'like':
        handleUpdateLike(state.active);
        break;
      case 'shuffle':
        if (state.listType === 'files') {
          dispatch({
            type: 'tracks-shuffle',
            tracksShuffle: !state.tracksShuffle
          });
          dispatch({
            type: 'tracks-pagenumber',
            tracksPageNumber: 0
          });
          dispatch({
            type: 'reset',
            pause: !!state.pause
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
            miniModePlaylist: (state.miniModePlaylist = true),
            minimalmode: (state.minimalmode = true)
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
    window.ipcApi.send('window-action', action);
  };

  const handleMenu = () => {
    window.ipcApi.send('show-context-menu', 1, 'menu');
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
            miniModePlaylist: (state.miniModePlaylist = true),
            minimalmode: (state.minimalmode = true)
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
        <Player>
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
    </div>
  );
}

export default App;
