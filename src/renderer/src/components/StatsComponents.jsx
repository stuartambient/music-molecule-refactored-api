import { useState, useEffect, useMemo } from 'react';
import List from './List';
import { openChildWindow } from './ChildWindows/openChildWindow';
import { useTotalTracksStat, useTopHundredArtistsStat, useGenres } from '../hooks/useDb';

const initTable = /* async */ (type, data = null) => {
  const name = 'table-data';
  const config = {
    width: 1200,
    height: 550,
    show: false,
    resizable: true,
    preload: 'metadataEditing',
    sandbox: true,
    webSecurity: true,
    contextIsolation: true
  };
  openChildWindow(name, type, config, data);
};

const tableStatus = async () => {
  try {
    const openTable = await window.api.checkForOpenTable('table-data');
    if (openTable) {
      await window.api.clearTable();

      return true;
    }
  } catch (e) {
    console.error(e); // Added console.error for better debugging of caught errors
    return false; // Returning false instead of e.message for consistency
  }
  return false;
};

export const TotalMedia = () => {
  const [totalTracks, setTotalTracks] = useState();
  useTotalTracksStat(setTotalTracks);
  return (
    <>
      {totalTracks ? (
        <div className="stats--totalmedia">
          <h1>{totalTracks.tracks} tracks</h1>
          <h3> in </h3>
          <h1>{totalTracks.albums} albums</h1>
        </div>
      ) : (
        <p>Loading...</p>
      )}
    </>
  );
};

/**
 * Loads track data based on type (genre/artist/album)
 *
 * @param {'genre' | 'artist' | 'album'} type - The kind of track category
 * @param {string|null} value - The selected genre/artist/album value
 * @param {(value: null) => void} reset - Setter to clear the selection
 */
const useTrackLoader = (type, value, reset) => {
  /* console.log('type: ', type, 'value: ', value, 'reset: ', reset); */
  useEffect(() => {
    if (!value) return;

    const tableMap = {
      genre: 'genre-tracks',
      artist: 'artist-tracks',
      album: 'album-tracks',
      root: 'root-tracks'
    };

    const loadedMsgMap = {
      genre: 'genre-tracks-loaded',
      artist: 'artist-tracks-loaded',
      album: 'album-tracks-loaded',
      root: 'root-tracks-loaded'
    };

    const tableName = tableMap[type];
    const loadedMsg = loadedMsgMap[type];

    let isSubscribed = true;

    const loadTracks = async () => {
      try {
        const tableStat = await tableStatus();
        if (isSubscribed && !tableStat) {
          await initTable(tableName);
        }

        if (isSubscribed) {
          window.api.getTracksByCategory(tableName, value); // generic IPC sender
        }
      } catch (error) {
        console.error(`Error loading ${type} tracks:`, error);
      }
    };

    const handleLoaded = (msg) => {
      if (isSubscribed && msg === loadedMsg) {
        reset(null);
      }
    };

    loadTracks();
    window.api.onTracksLoaded(handleLoaded);

    return () => {
      isSubscribed = false;
      window.api.off('tracks-loaded', handleLoaded);
    };
  }, [type, value, reset]);
};

export const TopHundredArtists = ({ dimensions }) => {
  const { topHundredArtists } = useTopHundredArtistsStat();
  const [selectedArtist, setSelectedArtist] = useState(null);

  /* console.log('artistsList: ', artistsList); */
  useTrackLoader('artist', selectedArtist, setSelectedArtist);

  const handleArtistClick = (e) => {
    const selected = e.target.id;
    if (selected) {
      setSelectedArtist(selected);
    }
  };

  return (
    <List
      data={topHundredArtists}
      height="100%" // Specify the desired height of the list
      width="100%"
      className="stats--list"
      onClick={handleArtistClick}
      stat="stat-artists"
      dimensions={dimensions}
      tableStatus={tableStatus}
      initTable={initTable}
      amountLoaded={topHundredArtists.length}
    />
  );
};

export const Genres = ({ dimensions }) => {
  const [genres, setGenres] = useState([]);
  const [selectedGenre, setSelectedGenre] = useState(null);
  useGenres(setGenres);
  //useGenre(genre, setGenre);
  useTrackLoader('genre', selectedGenre, setSelectedGenre);

  const handleGenreClick = (e) => {
    const selected = e.target.id;
    if (selected) {
      setSelectedGenre(selected);
    }
  };

  const genresSorted = useMemo(() => {
    return genres
      .slice()
      .sort((a, b) =>
        a.genre_display.localeCompare(b.genre_display, undefined, { sensitivity: 'base' })
      );
  }, [genres]);

  return (
    <List
      height="100%"
      width="100%"
      className="stats--list"
      data={genresSorted}
      onClick={handleGenreClick}
      stat="stat-genres"
      dimensions={dimensions}
      tableStatus={tableStatus}
      initTable={initTable}
      amountLoaded={genres.length}
    />
  );
};

export const AlbumsByRoot = ({ albums, amountLoaded, dimensions }) => {
  const [selectedAlbum, setSelectedAlbum] = useState(null);

  //useAlbum(album, setAlbum);
  useTrackLoader('album', selectedAlbum, setSelectedAlbum);

  const handleAlbumClick = async (e) => {
    const selected = e.target.id;
    if (selected) {
      setSelectedAlbum(e.target.id);
    }
  };

  const albumsSorted = useMemo(() => {
    return albums
      .slice()
      .sort((a, b) => a.foldername.localeCompare(b.foldername, undefined, { sensitivity: 'base' }));
  }, [albums]);

  return (
    <>
      <List
        data={albumsSorted}
        height="100%"
        width="100%"
        className="stats--list"
        onClick={handleAlbumClick}
        stat="stat-albums"
        amountLoaded={amountLoaded}
        dimensions={dimensions}
        tableStatus={tableStatus}
        initTable={initTable}
      />
    </>
  );
};

export const TracksByRoot = ({ selectedRoot, setSelectedRoot }) => {
  const [error, setError] = useState(null);

  useTrackLoader('root', selectedRoot, setSelectedRoot);

  if (error) {
    return <div>Error: {error}</div>;
  }

  return null;
};
