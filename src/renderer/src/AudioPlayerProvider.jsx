import { useReducer, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { MainAudioContext } from './mainAudioContext';
import usePlayback from './hooks/usePlayback';
import usePlaybackPreferences from './hooks/usePlaybackPreferences';
import useIpcEvent from './hooks/useIpcEvent';
import { PlaybackAudio } from './utility/playbackAudio';
import audioPlayerReducer from './audioPlayerReducer';
import { mainThemes, normalizeMainTheme } from '../../shared/themePreferences';

export const AudioPlayerProvider = ({ children }) => {
  const audioRef = useRef(null);
  if (!audioRef.current) audioRef.current = new PlaybackAudio(new Audio());
  /* const trackRef = useRef(null); */

  const initialState = {
    audioRef,
    playbackTrack: null,
    playbackStartTime: 0,
    playbackBackend: 'builtin',
    backendPreferenceRevision: 0,
    playlistGapless: false,
    gaplessPreferenceRevision: 0,
    gaplessTransition: null,
    gaplessBypass: false,
    playbackAlbumPath: null,
    listSelections: {},
    playbackQueue: [],
    playbackRequest: 0,
    playbackError: null,
    trackProblems: {},
    musicNotice: null,
    pendingAdvance: null,
    tracksHasMore: false,
    /* trackRef, */
    home: true,
    update: false,
    player: false,
    library: false,
    tagEditor: false,

    minimalmode: false,
    minimalmodeInfo: false,
    miniModePlaylist: false,
    /*  maximized: false, */
    active: '',
    newtrack: '',
    activeList: '',
    playNext: false,
    playPrev: false,
    nextTrack: '',
    prevTrack: '',
    artist: '',
    title: '',
    album: '',
    cover: '',
    duration: '',
    pause: true,
    volume: 1,
    albums: [],
    albumsPageNumber: 0,
    tracks: [],
    tracksPageNumber: 0,
    shuffledTracksPageNumber: 0,
    covers: [],
    coversPageNumber: 0,
    coversSearchTerm: '',
    coversDateSort: 'DESC',
    coversMissingReq: 'not-requested',
    playlistTracks: [],
    shuffledTracks: [],
    playlistInOrder: [],
    listType: 'files',
    listScroll: true,
    /*     selectedTrackListType: 'file', */
    searchTermFiles: '',
    searchTermAlbums: '',
    randomize: false,
    showMore: null,
    delay: false,
    isLiked: false,
    shuffle: false,
    tracksShuffle: false,
    playlistShuffle: false,
    seeking: false,
    flashDiv: '',
    setup: '',
    mainTheme: normalizeMainTheme(window.initialMainTheme)
  };

  const [state, send] = useReducer(audioPlayerReducer, initialState);
  const playbackSnapshot = useRef(null);
  const dispatch = useCallback((action) => {
    if (
      [
        'select-track',
        'advance-track',
        'retry-track',
        'pauseplay',
        'playback-error',
        'toggle-playlist-gapless',
        'hydrate-playlist-gapless',
        'set-playback-backend',
        'hydrate-playback-backend'
      ].includes(action.type)
    ) {
      send({ ...action, playbackSnapshot: playbackSnapshot.current?.() });
    } else {
      send(action);
    }
  }, []);
  useIpcEvent('catalog-changed', (kind) => dispatch({ type: 'catalog-changed', kind }));
  usePlayback(state, dispatch, playbackSnapshot);
  usePlaybackPreferences(state, dispatch);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.remove(...mainThemes);
    root.classList.add(normalizeMainTheme(state.mainTheme));
  }, [state.mainTheme]);

  useEffect(() => {
    const startTheme = normalizeMainTheme(window.initialMainTheme);
    console.log('startTheme: ', startTheme);
    dispatch({ type: 'set-main-theme', mainTheme: startTheme });
  }, [dispatch]);

  const setInitialPage = useCallback(
    (val) => {
      dispatch({
        type: 'set-page',
        home: val === 'home' ? true : false,
        update: val === 'update' ? true : false,
        player: false,
        library: false,
        tagEditor: false
      });
    },
    [dispatch]
  );

  useEffect(() => {
    const checkTable = async () => {
      const isPopulated = await window.ipcApi.getRoots();
      /* console.log('isPopulated: ', isPopulated.length, 'type: ', Array.isArray(isPopulated)); */
      if (isPopulated.length === 0) {
        setInitialPage('update');
        dispatch({
          type: 'config-options',
          setup: 'setup'
        });
      } else if (isPopulated.length > 0) {
        setInitialPage('home');
        /*   dispatch({
          type: 'database-populated',
          databasePopulated: true
        }); */
      }
    };
    checkTable();
  }, [setInitialPage, dispatch]);

  return (
    <MainAudioContext.Provider value={{ state, dispatch }}>{children}</MainAudioContext.Provider>
  );
};
