/* import { is } from '@electron-toolkit/utils'; */
import { useState, useEffect, useCallback } from 'react';
import { requestMusicTracks } from '../utility/musicRequests';
import { sortAlbumTracks } from '../utility/albumTrackOrder';

const useTracks = (
  tracksPageNumber,
  tracksSearchTerm,
  sortType,
  resetKey,
  state,
  dispatch,
  tracksShuffle
) => {
  const [tracksLoading, setTracksLoading] = useState(true);
  const [tracksError, setTracksError] = useState(false);
  const [hasMoreTracks, setHasMoreTracks] = useState(false);

  const isSubBoolean = useCallback(() => {
    if (state.pendingAdvance) return true;
    if (tracksPageNumber === 0 && state.tracks.length === 200) {
      /*       console.log('case #: ', 1); */
      return false;
    } else if (state.tracksShuffle && state.tracks.length === 0) {
      /* console.log('case #: ', 2); */
      return true;
    } else if (tracksPageNumber === 1 && state.tracks.length === 400) {
      /* console.log('case #: ', 3); */
      return false;
    } else if (tracksPageNumber > 1 && tracksPageNumber * 200 === state.tracks.length - 200) {
      /* console.log('case #: ', 4); */
      return false;
    } else if (state.listType === 'albums') {
      /*  console.log('case #: ', 5); */
      return false;
    } else {
      /* console.log('case #: ', 6); */
      return true;
    }
  }, [
    tracksPageNumber,
    state.tracks.length,
    state.tracksShuffle,
    state.listType,
    state.pendingAdvance
  ]);

  useEffect(() => {
    //let isSubscribed = true;

    let isSubscribed = isSubBoolean();

    const loadTracks = async () => {
      setTracksLoading(true);
      setTracksError(false);

      let trackRequest = await window.ipcApi.getTracks(
        tracksPageNumber,
        tracksSearchTerm,
        sortType
      );
      if (trackRequest && isSubscribed) {
        if (tracksPageNumber === 0) {
          dispatch({
            type: 'add-tracks',
            tracks: trackRequest
          });

          setTracksLoading(false);
          setHasMoreTracks(trackRequest.length === 200);
        }
        if (tracksPageNumber > 0) {
          dispatch({
            type: 'tracks-playlist',
            tracks: trackRequest
          });

          setTracksLoading(false);
          setHasMoreTracks(trackRequest.length === 200);
        }
      }
    };

    const loadShuffledTracks = async () => {
      setTracksLoading(true);
      setTracksError(false);
      if (tracksPageNumber === 0) {
        await window.ipcApi.setShuffledTracksArray();
      }

      if (!isSubscribed) return;

      const shuffledTracks = await window.ipcApi.getShuffledTracks(tracksPageNumber);
      if (shuffledTracks && isSubscribed) {
        if (tracksPageNumber === 0) {
          dispatch({
            type: 'add-tracks',
            tracks: shuffledTracks
          });
          setHasMoreTracks(shuffledTracks.length === 200);
          setTracksLoading(false);
        }

        if (tracksPageNumber > 0) {
          dispatch({
            type: 'tracks-playlist',
            tracks: shuffledTracks
          });
          setHasMoreTracks(shuffledTracks.length === 200);
          setTracksLoading(false);
        }
      }
    };

    const request = tracksShuffle ? loadShuffledTracks() : loadTracks();
    request.catch((error) => {
      if (!isSubscribed) return;
      setTracksLoading(false);
      setTracksError(error.message);
      dispatch({
        type: 'tracks-load-failed',
        error: {
          message:
            'The next library page could not be loaded. Reload the list or select another track.'
        }
      });
    });
    return () => (isSubscribed = false);
  }, [
    tracksPageNumber,
    tracksSearchTerm,
    sortType,
    resetKey,
    tracksShuffle,
    dispatch,
    state.listType
  ]);
  return {
    tracksLoading,
    hasMoreTracks,
    tracksError,
    tracksShuffle,
    resetKey
  };
};

const useAlbums = (albumsPageNumber, albumsSearchTerm, sortType, resetKey, dispatch) => {
  const [albumsLoading, setAlbumsLoading] = useState(true);
  const [albumsError, setAlbumsError] = useState(false);
  const [hasMoreAlbums, setHasMoreAlbums] = useState(false);

  useEffect(() => {
    let isSubscribed = true;
    let resultTimer;

    const loadAlbums = async () => {
      try {
        setAlbumsLoading(true);
        setAlbumsError(false);
        const albumRequest = await window.ipcApi.getAlbums(
          albumsPageNumber,
          albumsSearchTerm,
          sortType
        );

        if (albumRequest && isSubscribed) {
          resultTimer = setTimeout(() => {
            if (!isSubscribed) return;
            dispatch({
              type: 'albums-playlist',
              albums: albumRequest
            });
            setHasMoreAlbums(albumRequest.length === 200);
            setAlbumsLoading(false);
          }, 500);
        }
      } catch (error) {
        if (isSubscribed) {
          setAlbumsError(true);
          setAlbumsLoading(false);
        }
      }
    };

    loadAlbums();
    return () => {
      isSubscribed = false;
      clearTimeout(resultTimer);
    };
  }, [albumsPageNumber, albumsSearchTerm, sortType, resetKey, dispatch]);

  return { albumsLoading, hasMoreAlbums, albumsError };
};

const useAlbumTracks = (pattern, dispatch, cache) => {
  const [albumTracks, setAlbumTracks] = useState(() => cache?.get(pattern) || []);
  const [error, setError] = useState([]);

  useEffect(() => {
    // Virtualized rows and the Albums tab remount without the user reopening an album.
    if (pattern && cache?.has(pattern)) {
      setAlbumTracks(cache.get(pattern));
      return;
    }
    let subscribed = true;
    const loadAlbumTracks = async () => {
      try {
        setAlbumTracks([]);
        const albumTracksRequest = await requestMusicTracks(
          'prepare-music-tracks',
          [{ album: pattern, inspect: true }],
          dispatch,
          'Album availability',
          () => subscribed,
          true
        );
        if (albumTracksRequest && subscribed) {
          const sorted = sortAlbumTracks(albumTracksRequest);
          cache?.set(pattern, sorted);
          setAlbumTracks(sorted);
        }
      } catch (err) {
        if (subscribed) {
          console.error('Error loading album tracks:', err);
          setError(err.message || 'An error occurred while fetching album tracks.');
        }
      }
    };

    if (pattern) {
      loadAlbumTracks();
    }
    return () => (subscribed = false);
  }, [pattern, dispatch, cache]);
  return { albumTracks, setAlbumTracks, error };
};

const useTopHundredArtistsStat = () => {
  const [topHundredArtists, setTopHundredArtists] = useState([]);
  useEffect(() => {
    let subscribed = true;
    const getTopHundredArtists = async () => {
      const topHundredArtistsRequest = await window.ipcApi.artistsByNumTracks();
      if (topHundredArtistsRequest && subscribed) {
        console.log('top hundred artist request: ', topHundredArtistsRequest);
        setTopHundredArtists(topHundredArtistsRequest);
      } else {
        return;
      }
    };
    getTopHundredArtists();
    return () => (subscribed = false);
  }, []);
  return { topHundredArtists };
};

const useGenres = (setGenres) => {
  /* const [genres, setGenres] = useState([]); */
  useEffect(() => {
    let subscribed = true;
    const getGenres = async () => {
      const genresRequest = await window.ipcApi.genresStat();
      if (genresRequest && subscribed) {
        setGenres(genresRequest);
      } else {
        return 'no results';
      }
    };
    getGenres();
    return () => (subscribed = false);
  }, [setGenres]);
  /* return genres; */
};

const useAllAlbumsCovers = (
  coversPageNumber,
  coversSearchTerm,
  coversDateSort,
  coversMissingReq,
  dispatch,
  /* resetKey, */
  coverslength
) => {
  /*   console.log('reset key: ', resetKey); */
  const [coversLoading, setCoversLoading] = useState(true);
  const [coversError, setCoversError] = useState(false);
  const [hasMoreCovers, setHasMoreCovers] = useState(false);

  useEffect(() => {
    let isSubscribed = true;
    let resultTimer;

    const loadCovers = async () => {
      try {
        setCoversLoading(true);
        setCoversError(false);

        const coversRequest = await window.ipcApi.getCovers(
          coversPageNumber,
          coversSearchTerm,
          coversDateSort,
          coversMissingReq
        );

        if (coversRequest && isSubscribed) {
          resultTimer = setTimeout(() => {
            if (!isSubscribed) return;
            dispatch({
              type: 'set-covers',
              covers: coversRequest
            });

            setHasMoreCovers(coversRequest.length >= 100);
            setCoversLoading(false);
          }, 250); // Adjust the delay time (500ms) as needed
        }
      } catch (error) {
        if (isSubscribed) {
          setCoversError(true);
          setCoversLoading(false);
        }
      }
    };

    // Condition to decide when to load covers
    if ((coversPageNumber === 0 && coverslength === 0) || coversPageNumber * 100 === coverslength) {
      loadCovers();
    }

    return () => {
      isSubscribed = false;
      clearTimeout(resultTimer);
    };
  }, [
    coversPageNumber,
    coversSearchTerm,
    coversDateSort,
    coversMissingReq,
    dispatch,
    /*  resetKey, */
    coverslength
  ]);

  return { coversLoading, hasMoreCovers, coversError };
};

const usePlaylistDialog = (req, playlistTracks, dispatch, setPlaylistReq) => {
  const [playlistLoading, setPlaylistLoading] = useState(false);
  useEffect(() => {
    let isSubscribed = true;

    const openplaylist = async () => {
      setPlaylistLoading(true);
      try {
        const openpl = await requestMusicTracks(
          'open-playlist',
          [],
          dispatch,
          'Open Playlist',
          () => isSubscribed
        );
        if (isSubscribed) {
          if (!openpl?.length) {
            setPlaylistReq('');
          } else {
            dispatch({
              type: 'load-playlist',
              playlistTracks: openpl
            });
            setPlaylistReq('');
          }
        }
      } catch (e) {
        console.log(e.message);
        if (isSubscribed) setPlaylistReq('');
      } finally {
        if (isSubscribed) setPlaylistLoading(false);
      }
    };

    const saveplaylist = async () => {
      try {
        const savepl = await window.ipcApi.savePlaylist(playlistTracks);
        if (isSubscribed) {
          if (savepl === 'action cancelled') {
            setPlaylistReq('');
          } else {
            /* console.log(savepl); */
            setPlaylistReq(''); // Clear request after handling
          }
        }
      } catch (e) {
        console.log(e.message);
      }
    };

    if (req === 'playlist-open') {
      openplaylist();
    } else {
      setPlaylistLoading(false);
      if (req === 'playlist-save') saveplaylist();
    }

    return () => {
      isSubscribed = false; // Cleanup when component unmounts
    };
  }, [req, playlistTracks, dispatch, setPlaylistReq]);
  return playlistLoading;
};

const useDistinctDirectories = (setDirectories) => {
  useEffect(() => {
    let subscribed = true;
    const getDistinctDirectories = async () => {
      const myDirectories = await window.ipcApi.distinctDirectories();
      if (myDirectories && subscribed) {
        setDirectories(myDirectories);
      }
    };
    if (subscribed) {
      getDistinctDirectories();
    }
    return () => (subscribed = false);
  }, [setDirectories]);
};

const useTotalTracksStat = (setTotalTracks) => {
  const [error, setError] = useState(null);

  useEffect(() => {
    let isSubscribed = true;

    const getTotalTracks = async () => {
      try {
        const totalTracksRequest = await window.ipcApi.totalTracksStat();
        if (totalTracksRequest && isSubscribed) {
          setTotalTracks(totalTracksRequest);
        }
      } catch (err) {
        if (isSubscribed) {
          console.error('Error fetching total tracks stat:', err);
          setError(err.message || 'An error occurred while fetching total tracks.');
        }
      }
    };

    getTotalTracks();

    return () => {
      isSubscribed = false;
    };
  }, [setTotalTracks]);

  return { error };
};

export {
  useTracks,
  useAlbums,
  useAlbumTracks,
  useTopHundredArtistsStat,
  useGenres,
  usePlaylistDialog,
  useAllAlbumsCovers,
  useDistinctDirectories,
  useTotalTracksStat
};
