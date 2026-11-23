import { useState, useRef, useEffect, useMemo /* , Profiler */ } from 'react';
import { useAudioPlayer } from '../mainAudioContext';
import { getPlaybackPosition, getPlaybackQueue } from '../utility/playbackState';
import { findPlayingAlbum } from '../utility/albumPlayback';
import AlbumTrackList from './AlbumTrackList';
import RememberedList from './RememberedList';
import { selectedTrackIndex } from '../utility/listSelection';

import { v4 as uuidv4 } from 'uuid';
import { Virtuoso } from 'react-virtuoso';
import MediaMenu from './MediaMenu';
import Item from './Item';
import Loader from './Loader';
import { useTracks, useAlbums, useAlbumTracks, usePlaylistDialog } from '../hooks/useDb';
import '../style/InfiniteList.css';

function AlbumListItem({ album, expanded, onToggle, trackCache, ...props }) {
  const { dispatch } = useAudioPlayer();
  const { albumTracks } = useAlbumTracks(expanded ? album.fullpath : null, dispatch, trackCache);
  return (
    <Item
      {...props}
      type="folder"
      id={album.id}
      foldername={album.foldername}
      fullpath={album.fullpath}
      expanded={expanded}
      handleAlbumTracksRequest={onToggle}
      albumsTracks={
        expanded ? <AlbumTrackList tracks={albumTracks} albumPath={album.fullpath} /> : null
      }
    />
  );
}

const InfiniteList = () => {
  const { state, dispatch } = useAudioPlayer();
  const [tracksSearchTerm, setTracksSearchTerm] = useState('');
  const [albumsSearchTerm, setAlbumsSearchTerm] = useState('');

  /*   const [mainTheme, setMainTheme] = useState(''); */

  /*   window.getPreferences; */

  // Preserve expansion order so the last unfolded album is the fallback return target.
  const [expandedAlbums, setExpandedAlbums] = useState([]);
  const [filesSortType, setFilesSortType] = useState('DESC');
  const [albumsSortType, setAlbumsSortType] = useState('DESC');
  const [resetKey, setResetKey] = useState('');
  const [albumsResetKey, setAlbumsResetKey] = useState('');
  const [playlistReq, setPlaylistReq] = useState('');

  const { tracksLoading, hasMoreTracks, tracksError } = useTracks(
    state.tracksPageNumber,
    tracksSearchTerm,
    filesSortType,
    resetKey,
    state,
    dispatch,
    state.tracksShuffle
  );
  const { albumsLoading, hasMoreAlbums, albumsError } = useAlbums(
    state.albumsPageNumber,
    albumsSearchTerm,
    albumsSortType,
    albumsResetKey,
    dispatch
  );

  const [contSize, setContSize] = useState(0);

  const fileslistRef = useRef(null);
  const playlistRef = useRef(null);
  const albumSnapshot = useRef(null);
  const albumView = useMemo(
    () => ({
      key: JSON.stringify([albumsSearchTerm, albumsSortType, albumsResetKey]),
      tracks: new Map()
    }),
    [albumsSearchTerm, albumsSortType, albumsResetKey]
  );
  const albumViewKey = albumView.key;
  const albumTrackCache = albumView.tracks;
  const resultsRef = useRef(null);

  /*   useEffect(() => {
    const loadPlayerTheme = async () => {
      const preferences = await window.api.getPreferences();
      console.log('mainTheme; ', preferences.mainTheme);
      setMainTheme(preferences.mainTheme || '');
    };
    loadPlayerTheme();
  }, []); */

  useEffect(() => {
    if (resultsRef.current) {
      const handleResize = () => {
        const contDimension = resultsRef.current.getBoundingClientRect();
        setContSize(contDimension);
      };

      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(resultsRef.current);

      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [resultsRef]);

  useEffect(() => {
    if (state.flashDiv?.id) {
      const timer = setTimeout(() => {
        dispatch({
          type: 'reset-flash-div'
        });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [dispatch, state.flashDiv]);

  const playlistLoading = usePlaylistDialog(
    playlistReq,
    state.playlistTracks,
    dispatch,
    setPlaylistReq
  );

  const albumSelection = state.listSelections?.albumTracksActive;
  const playingAlbum =
    state.activeList === 'albumTracksActive' && !albumSelection?.completed
      ? findPlayingAlbum(state.albums, state.playbackTrack)
      : null;
  const selectedAlbumPath = state.selectedAlbumPath || albumSelection?.albumPath;
  // Each list keeps its own track when playback moves to another source.
  const rememberedAlbum =
    albumSelection?.trackId && !albumSelection.completed
      ? state.albums.find((album) => album.fullpath === albumSelection.albumPath)
      : null;
  const returnAlbum = playingAlbum || rememberedAlbum;
  const returnTrackId = playingAlbum
    ? state.playbackTrack?.track_id
    : rememberedAlbum
      ? albumSelection.trackId
      : undefined;
  const returnAlbumPath = returnAlbum?.fullpath || expandedAlbums.at(-1);
  const returnAlbumIndex = state.albums.findIndex((album) => album.fullpath === returnAlbumPath);
  const selectedFile = selectedTrackIndex(state, 'tracklistActive', state.tracks);
  const selectedPlaylistTrack = selectedTrackIndex(state, 'playlistActive', state.playlistTracks);

  const playbackPosition = getPlaybackPosition(state, getPlaybackQueue(state));
  const { activeList, listType, listScroll } = state;
  useEffect(() => {
    if (!listScroll || playbackPosition < 0) return;
    const list = activeList === 'playlistActive' ? playlistRef : fileslistRef;
    const showingActiveList =
      (activeList === 'playlistActive' && listType === 'playlist') ||
      (activeList === 'tracklistActive' && listType === 'files');
    if (showingActiveList) {
      list.current?.scrollToIndex({ index: playbackPosition, behavior: 'smooth', align: 'start' });
    }
  }, [playbackPosition, activeList, listType, listScroll]);

  const handleTextSearch = (e) => {
    e.preventDefault();
    const term = e.currentTarget.elements.namedItem('textsearch').value;
    if (state.listType === 'files') {
      if (term === '' || term === tracksSearchTerm) setResetKey(getKey());
      dispatch({
        type: 'reset-tracks',
        tracks: []
      });
      dispatch({
        type: 'tracks-pagenumber',
        tracksPageNumber: 0
      });
      dispatch({
        type: 'set-next-track',
        nextTrack: ''
      });
      dispatch({
        type: 'set-prev-track',
        prevTrack: ''
      });
      setTracksSearchTerm(term);
    }
    if (state.listType === 'albums') {
      setAlbumsResetKey(getKey());

      dispatch({
        type: 'reset-albums',
        albums: []
      });
      dispatch({
        type: 'albums-pagenumber',
        albumsPageNumber: 0
      });

      setAlbumsSearchTerm(term);
    }
  };

  const handlePlaylistFiles = (e) => {
    switch (e.currentTarget.id) {
      case 'playlist-save':
        return setPlaylistReq('playlist-save');
      case 'playlist-open': {
        return setPlaylistReq('playlist-open');
      }
      case 'playlist-clear': {
        dispatch({
          type: 'playlist-clear',
          playlistTracks: [],
          newtrack: '',
          active: '',
          nextTrack: '',
          prevTrack: '',
          artist: '',
          title: '',
          album: '',
          duration: '',
          pause: true
        });
        return;
      }
      default:
        return;
    }
  };

  const handleAlbumTracksRequest = (albumPath) => {
    if (!expandedAlbums.includes(albumPath)) {
      dispatch({ type: 'select-album', albumPath });
    } else {
      // Explicitly reopening an album refreshes its tracks and availability.
      albumTrackCache.delete(albumPath);
    }
    setExpandedAlbums((previous) =>
      previous.includes(albumPath)
        ? previous.filter((path) => path !== albumPath)
        : [...previous, albumPath]
    );
  };

  const handleSortClick = (e) => {
    if (state.listType === 'files') {
      dispatch({ type: 'sort-tracks' });
      setFilesSortType(e.currentTarget.id);
      setResetKey(getKey());
    } else if (state.listType === 'albums') {
      dispatch({
        type: 'albums-pagenumber',
        albumsPageNumber: 0
      });
      dispatch({
        type: 'reset-albums',
        albums: []
      });
      setAlbumsSortType(e.currentTarget.id);
      setAlbumsResetKey(getKey());
    }
  };

  const getKey = () => uuidv4();

  const loadMoreTracks = () => {
    if (!hasMoreTracks) return;

    dispatch({
      type: 'tracks-pagenumber',
      tracksPageNumber: state.tracksPageNumber + 1
    });
  };

  const loadMoreAlbums = () => {
    if (!hasMoreAlbums) return;
    dispatch({
      type: 'albums-pagenumber',
      albumsPageNumber: state.albumsPageNumber + 1
    });
  };

  const listClassNames = () => {
    if (
      state.player &&
      !state.library &&
      !state.update &&
      !state.home &&
      !state.tagEditor &&
      !state.minimalmode
    ) {
      return 'results results-hidden results-centered';
    }
    if (!state.library && state.player && state.minimalmode) {
      return 'results results-hidden results-hidden-minimal';
    }
    if (
      (!state.library && state.player) ||
      (!state.library && state.update) ||
      (!state.library && state.home) ||
      (!state.library && state.tagEditor)
    ) {
      return 'results results-hidden';
    }

    if (state.library && !state.minimalmode) {
      return `results ${state.mainTheme}`;
    }
    if (state.library && state.minimalmode) {
      return `results results-minimal ${state.mainTheme}`;
    }
  };

  return (
    <>
      {state.library === true ? (
        <MediaMenu
          handleSortClick={handleSortClick}
          handleTextSearch={handleTextSearch}
          handlePlaylistFiles={handlePlaylistFiles}
          filesSortType={filesSortType}
          albumsSortType={albumsSortType}
          /* playlistShuffle={state.playlistShuffle} */
        />
      ) : null}
      <div className={listClassNames()} ref={resultsRef}>
        {state.listType === 'files' && !state.tracks.length && !tracksLoading ? (
          <div className="noresults">No results</div>
        ) : null}
        {state.listType === 'albums' && !state.albums.length && !albumsLoading ? (
          <div className="noresults">No results</div>
        ) : null}
        {state.listType === 'playlist' && !state.playlistTracks.length && !playlistLoading ? (
          <div className="noresults">No current playlist</div>
        ) : null}
        <>
          <div className={state.listType === 'files' ? 'files' : 'files-list-hidden'}>
            {/* <Profiler id="Virtuoso" onRender={onRender}> */}
            <Virtuoso
              className="files-list"
              style={{ height: `${contSize.height}px` }}
              ref={fileslistRef}
              data={state.tracks}
              totalCount={state.tracks.length}
              endReached={loadMoreTracks}
              components={{
                Footer: () => {
                  if (tracksLoading) {
                    return <div className="item itemloading">Loading...</div>;
                  }
                  if (tracksError) {
                    return <div className="item trackserror">{tracksError}</div>;
                  }
                  if (!hasMoreTracks) {
                    return <div className="item hasmoretracks">No more tracks available.</div>;
                  }
                  return null; // No footer if none of the states apply
                }
              }}
              /* components={{ Scroller: CustomScroller }} */
              itemContent={(index, item) => {
                /* console.log('index: ', index) */
                if (!item) return null; // Handle empty items

                return (
                  <Item
                    type="files"
                    key={`${item.track_id}:${index}`}
                    divId={`${item.track_id}--item-div`}
                    className={
                      selectedFile === index && state.activeList === 'tracklistActive'
                        ? 'item active'
                        : 'item'
                    }
                    isSelected={selectedFile === index}
                    showSelectionPlay={
                      selectedFile === index && state.activeList !== 'tracklistActive'
                    }
                    track={item}
                    href={item.track_id}
                    id={item.track_id}
                    like={item.like}
                    audiofile={item.audiotrack}
                    data-val={index}
                    artist={item.performers ? item.performers : 'not available'}
                    title={item.title ? item.title : item.audiotrack}
                    album={item.album ? item.album : 'not available'}
                    genre={item.genres ? item.genres : 'not available'}
                    codecs={item.codecs ? item.codecs : 'not available'}
                    bitrate={item.audioBitrate ? item.audioBitrate : 'not available'}
                    samplerate={item.audioSampleRate ? item.audioSampleRate : 'not available'}
                  />
                );
              }}
            />
            {/* </Profiler> */}
          </div>
        </>
        <>
          <div className={state.listType === 'albums' ? 'albums' : 'albums-list-hidden'}>
            {state.listType === 'albums' && state.library && (
              <RememberedList
                key={albumViewKey}
                memory={albumSnapshot}
                memoryKey={albumViewKey}
                targetIndex={returnAlbumIndex}
                targetTrackId={returnTrackId}
                onRestore={() => {
                  if (returnAlbum) {
                    setExpandedAlbums((previous) =>
                      previous.includes(returnAlbum.fullpath)
                        ? previous
                        : [...previous, returnAlbum.fullpath]
                    );
                  }
                }}
                computeItemKey={(_index, album) => album.id}
                data={state.albums}
                className="albums-list" /*  */
                style={{ height: `${contSize.height}px` }}
                totalCount={state.albums.length}
                endReached={loadMoreAlbums}
                components={{
                  Footer: () => {
                    if (albumsLoading) {
                      return <div className="item itemloading">Loading...</div>;
                    }
                    if (albumsError) {
                      return <div className="item trackserror">{albumsError}</div>;
                    }
                    if (!hasMoreAlbums) {
                      return <div className="item hasmoretracks">No more results.</div>;
                    }
                    return null;
                  }
                }}
                itemContent={(index, item) => {
                  return (
                    <AlbumListItem
                      album={item}
                      trackCache={albumTrackCache}
                      expanded={expandedAlbums.includes(item.fullpath)}
                      onToggle={() => handleAlbumTracksRequest(item.fullpath)}
                      key={item.id}
                      id={item.id}
                      className={`item${playingAlbum === item && state.activeList === 'albumTracksActive' ? ' album-playing' : ''}${selectedAlbumPath === item.fullpath && playingAlbum === item ? ' album-selected' : ''}`}
                      isSelected={selectedAlbumPath === item.fullpath}
                      isPlayingAlbum={
                        playingAlbum === item && state.activeList === 'albumTracksActive'
                      }
                      href="http://"
                      val={index}
                      foldername={item.foldername}
                      term={item.fullpath}
                      fullpath={item.fullpath}
                    />
                  );
                }}
              />
            )}
          </div>
        </>
        <>
          <div
            className={state.listType === 'playlist' ? 'playlist' : 'playlist-list-hidden'}
            aria-busy={playlistLoading}
          >
            {playlistLoading && (
              <div className="playlist-loading" role="status">
                <span aria-hidden="true">
                  <Loader />
                </span>
                <span>Loading playlist…</span>
                <span className="playlist-loading-detail">Checking music files</span>
              </div>
            )}
            <Virtuoso
              ref={playlistRef}
              data={state.playlistTracks}
              className="playlist-list"
              totalCount={state.playlistTracks.length}
              style={{ height: `${contSize.height}px` }}
              itemContent={(index, item) => {
                return (
                  <Item
                    type="playlist"
                    key={`${item.track_id}:${index}`}
                    divId={`${item.track_id}--item-div`}
                    className={
                      selectedPlaylistTrack === index && state.activeList === 'playlistActive'
                        ? 'item active'
                        : 'item'
                    }
                    isSelected={selectedPlaylistTrack === index}
                    showSelectionPlay={
                      selectedPlaylistTrack === index && state.activeList !== 'playlistActive'
                    }
                    track={item}
                    href={item.track_id}
                    id={item.track_id}
                    like={item.like}
                    audiofile={item.audiotrack}
                    data-val={index}
                    artist={item.performers ? item.performers : 'not available'}
                    title={item.title ? item.title : item.audiotrack}
                    album={item.album ? item.album : 'not available'}
                  />
                );
              }}
            />
          </div>
        </>
      </div>
    </>
  );
};

export default InfiniteList;
