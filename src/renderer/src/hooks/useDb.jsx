/* import { is } from '@electron-toolkit/utils'; */
import { useState, useEffect } from 'react';
import useLibraryPages from './useLibraryPages';
import { requestMusicTracks } from '../utility/musicRequests';
import { sortAlbumTracks } from '../utility/albumTrackOrder';

const useTracks = (
  page,
  term,
  sort,
  resetKey,
  state,
  dispatch,
  shuffle,
  searchField = 'metadata'
) => {
  const result = useLibraryPages(
    'tracks',
    page,
    term,
    sort,
    resetKey,
    dispatch,
    state.tracksRevision || 0,
    shuffle,
    'not-requested',
    searchField
  );
  return {
    tracksLoading: result.loading,
    tracksError: result.error,
    hasMoreTracks: result.hasMore,
    tracksShuffle: shuffle,
    resetKey
  };
};
const useAlbums = (page, term, sort, resetKey, dispatch, revision = 0) => {
  const result = useLibraryPages('albums', page, term, sort, resetKey, dispatch, revision);
  return {
    albumsLoading: result.loading,
    albumsError: result.error,
    hasMoreAlbums: result.hasMore
  };
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
  page,
  term,
  sort,
  missing,
  dispatch,
  _length,
  revision = 0,
  searchField = 'metadata'
) => {
  const result = useLibraryPages(
    'covers',
    page,
    term,
    sort,
    '',
    dispatch,
    revision,
    false,
    missing,
    searchField
  );
  return {
    coversLoading: result.loading,
    coversError: result.error,
    hasMoreCovers: result.hasMore
  };
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
