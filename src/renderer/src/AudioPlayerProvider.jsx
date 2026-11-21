import { useReducer, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { MainAudioContext } from './mainAudioContext';
import usePlayback from './hooks/usePlayback';
import audioPlayerReducer from './audioPlayerReducer';
import { mainThemes, normalizeMainTheme } from '../../shared/themePreferences';

export const AudioPlayerProvider = ({ children }) => {
  const audioRef = useRef(null);
  if (!audioRef.current) audioRef.current = new Audio();
  /* const trackRef = useRef(null); */

  const initialState = {
    audioRef,
    playbackTrack: null,
    playbackAlbumPath: null,
    listSelections: {},
    playbackQueue: [],
    playbackRequest: 0,
    playbackError: null,
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

  const [state, dispatch] = useReducer(audioPlayerReducer, initialState);
  usePlayback(state, dispatch);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.remove(...mainThemes);
    root.classList.add(normalizeMainTheme(state.mainTheme));
  }, [state.mainTheme]);

  useEffect(() => {
    const startTheme = normalizeMainTheme(window.initialMainTheme);
    console.log('startTheme: ', startTheme);
    dispatch({ type: 'set-main-theme', mainTheme: startTheme });
  }, []);

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
  }, [setInitialPage]);

  return (
    <MainAudioContext.Provider value={{ state, dispatch }}>{children}</MainAudioContext.Provider>
  );
};
