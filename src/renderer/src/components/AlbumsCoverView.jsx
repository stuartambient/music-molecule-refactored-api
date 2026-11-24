import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import classNames from 'classnames';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { useAudioPlayer } from '../mainAudioContext';
import { useAllAlbumsCovers } from '../hooks/useDb';
import useIpcEvent from '../hooks/useIpcEvent';
import NoImage from '../assets/noimage.jpg';
import { useVirtualizer } from '@tanstack/react-virtual';
const Overlay = React.lazy(() => import('./Overlay'));
import { openChildWindow } from './ChildWindows/openChildWindow';
import { requestMusicTracks } from '../utility/musicRequests';
import { sortAlbumTracks } from '../utility/albumTrackOrder';
//import Overlay from './Overlay';
import '../style/AlbumsCoverView.css';

const AlbumsCoverView = ({ /* resetKey,  */ coverSize, className }) => {
  const { state, dispatch } = useAudioPlayer();
  const albumPlayRequest = useRef(0);
  /*  const [menu, setMenu] = useState(false); */
  const [openFolder, setOpenFolder] = useState(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [currentAlbum, setCurrentAlbum] = useState('');

  /* const [isScrolling, setIsScrolling] = useState(false); */ // State to control scrolling
  const { coversLoading, hasMoreCovers, coversError } = useAllAlbumsCovers(
    state.coversPageNumber,
    state.coversSearchTerm,
    state.coversDateSort,
    state.coversMissingReq,
    dispatch,
    /* resetKey, */
    state.covers.length,
    state.coversRevision || 0
  );

  const parentRef = useRef(null);
  const coversObserver = useRef();

  const getEstimatedSize = useCallback(() => {
    return coverSize === 1 ? 100 : coverSize === 2 ? 150 : 200;
  }, [coverSize]);

  const gap = 10;

  const calculateLayout = useCallback(() => {
    const estimatedSize = getEstimatedSize();
    const columns = Math.max(1, Math.floor((containerSize.width + gap) / (estimatedSize + gap)));
    const rows = Math.ceil(state.covers.length / columns);
    return { columns, rows, estimatedSize };
  }, [containerSize.width, getEstimatedSize, state.covers.length]);

  const { columns, rows, estimatedSize } = useMemo(() => calculateLayout(), [calculateLayout]);

  useEffect(
    () => {
      // Capture the current value of the ref

      const currentElement = parentRef.current;

      const resizeObserver = new ResizeObserver(() => {
        if (currentElement) {
          setContainerSize({
            width: currentElement.offsetWidth,
            height: currentElement.offsetHeight
          });
        }
      });

      if (currentElement) {
        resizeObserver.observe(currentElement);
      }

      return () => {
        if (currentElement) {
          resizeObserver.unobserve(currentElement);
        }
      };
    },
    [
      /* parentRef, containerSize */
    ]
  );

  const rowVirtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedSize + gap,
    horizontal: false
  });

  useEffect(() => {
    if (state.covers.length) {
      rowVirtualizer.measure();
    }
  }, [state.covers.length, rowVirtualizer]);

  const stopAlbumPlay = useCallback(() => {
    albumPlayRequest.current++;
    setCurrentAlbum('');
    dispatch({
      type: 'stop-this-album'
    });
    dispatch({ type: 'reset', pause: true });
  }, [setCurrentAlbum, dispatch]);

  const handlePlayReq = useCallback(
    async (event, id) => {
      const request = ++albumPlayRequest.current;
      setCurrentAlbum(id);
      const requestedTracks = await requestMusicTracks(
        'prepare-music-tracks',
        [{ album: id }],
        dispatch,
        'Play album',
        () => request === albumPlayRequest.current
      );

      const albumTracks = requestedTracks ? sortAlbumTracks(requestedTracks) : null;
      if (request === albumPlayRequest.current && !albumTracks?.length) setCurrentAlbum('');

      if (request === albumPlayRequest.current && albumTracks?.length) {
        dispatch({
          type: 'play-this-album',
          playlistTracks: albumTracks,
          list: 'playlistActive'
        });

        dispatch({
          type: 'select-track',
          track: albumTracks[0],
          index: 0,
          list: 'playlistActive',
          play: true
        });
      }
    },
    [dispatch]
  );

  useEffect(() => {
    const handleOverlayClick = (event) => {
      console.log('handleOverlayClick: ', event);
      const playButton = event.target.closest('.play-stop-button');
      /*  console.log('playButton: ', playButton.id); */
      if (playButton) {
        const id = playButton.id;
        /* const fullpath = playButton.getAttribute('fullpath'); */
        /* console.log(id, '--', fullpath); */
        if (currentAlbum === id) {
          stopAlbumPlay();
        } else {
          handlePlayReq(event, id /* , fullpath */);
        }
      } else {
        const contextMenu = event.target.closest('.context-menu');
        if (!contextMenu) return;
        const path = contextMenu.getAttribute('fullpath');
        const folder = contextMenu.getAttribute('album');
        window.ipcApi.showAlbumCoverMenu(path, folder);
      }
    };

    const container = parentRef.current;
    if (container) {
      container.addEventListener('click', handleOverlayClick);
    }

    // Cleanup on unmount
    return () => {
      if (container) {
        container.removeEventListener('click', handleOverlayClick);
      }
    };
  }, [currentAlbum, handlePlayReq, stopAlbumPlay]); // <-- only if album change matters to your click handler

  const handleAlbumToPlaylist = async (path) => {
    console.log('path: ', path);
    const albumTracks = await requestMusicTracks(
      'prepare-music-tracks',
      [{ album: path }],
      dispatch,
      'Add album to Playlist'
    );
    if (albumTracks?.length) {
      dispatch({
        type: 'play-album',
        playlistTracks: albumTracks
      });
    }
  };

  const handleCoverSearch = async (search) => {
    const { album, path } = search;

    let artist, title;
    if (album.includes('-')) {
      [artist, title] = album
        .split('-')
        .map((part) => part.replaceAll(/\W/g, ' ').replaceAll('and', ' '));
    } else {
      title = album;
    }

    return openChildWindow('cover-search-alt', 'cover-search-alt', { artist, title, path });
  };

  useEffect(() => {
    const sendOpenFolder = async () => {
      return await window.ipcApi.openAlbumFolder(openFolder);
    };
    if (openFolder) {
      sendOpenFolder();
    }
    setTimeout(() => setOpenFolder(''), 1000);
  }, [openFolder]);

  const handleContextMenu = (option) => {
    const { menuoption, path, folder } = option;

    switch (menuoption) {
      case 'add album to playlist': {
        console.log('hit ablum to playlist');
        handleAlbumToPlaylist(path);
        break;
      }
      case 'open album folder': {
        if (openFolder === path) return;
        setOpenFolder(path);
        break;
      }
      case 'cover search': {
        const regex = /(\([^)]*\)|\[[^\]]*\]|\{[^}]*\})/g;
        const refAlbum = folder.replace(regex, '');
        return handleCoverSearch({ path: path, album: refAlbum });
      }
      default:
        return;
    }
  };

  useIpcEvent('album-menu', handleContextMenu);

  /*   // Function to start continuous scrolling
  const startScrolling = useCallback(() => {
    setIsScrolling(true); // Set the scrolling state to true
  }, []);

  const stopScrolling = useCallback(() => {
    setIsScrolling(false); // Set the scrolling state to false
  }, []); */

  /*   useEffect(() => {
    let scrollInterval; // Variable to hold the scroll interval

    if (isScrolling && parentRef.current) {
      // Check if scrolling is enabled and the container is available
      scrollInterval = setInterval(() => {
        if (parentRef.current) {
          parentRef.current.scrollBy(0, 1); // Scroll the container down by 1 pixel
        }
      }, 1); // Adjust the interval time to control scroll speed (20ms)
    }

    return () => clearInterval(scrollInterval); // Clean up interval when component unmounts or scrolling stops
  }, [isScrolling]); // Re-run the effect when the `isScrolling` state changes */

  const lastCoverElement = useCallback(
    (node) => {
      if (coversLoading) return;
      if (coversObserver.current) coversObserver.current.disconnect();
      coversObserver.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasMoreCovers) {
            console.log('lce: ', entries);
            dispatch({
              type: 'set-covers-pagenumber',
              coversPageNumber: state.coversPageNumber + 1
            });
          }
        },
        {
          root: document.querySelector('.albums-coverview'),
          threshold: 0.5
        }
      );
      if (node) coversObserver.current.observe(node);
    },
    [coversLoading, dispatch, hasMoreCovers, state.coversPageNumber]
  );

  useEffect(() => {
    if (!coversObserver.current && state.covers.length > 0) {
      console.log('lastCoverElement safeguard called');
      dispatch({
        type: 'set-covers-pagenumber',
        coversPageNumber: state.coversPageNumber + 1
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coversObserver]);

  const coverImageSize = classNames('cover-image', {
    'image-small': coverSize === 1,
    'image-medium': coverSize === 2,
    'image-large': coverSize === 3
  });

  const coverTextSize = classNames('overlay-text', {
    'text-small': coverSize === 1,
    'text-medium': coverSize === 2,
    'text-large': coverSize === 3
  });

  return (
    <div
      ref={parentRef}
      className={className}
      style={{
        width: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        maxHeight: '100vh',
        maxWidth: '100vw'
      }}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative'
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.index}
            data-index={virtualRow.index}
            ref={virtualRow.index === rows - 1 ? lastCoverElement : null}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, ${estimatedSize}px)`,
                gap: `${gap}px`,
                justifyContent: 'center'
              }}
            >
              {Array.from({ length: columns }).map((_, columnIndex) => {
                const itemIndex = virtualRow.index * columns + columnIndex;
                const item = state.covers[itemIndex];
                if (!item) return;

                return (
                  <div
                    className="imagediv"
                    id={item.id}
                    key={itemIndex}
                    style={{
                      width: `${estimatedSize}px`,
                      height: `${estimatedSize}px`,
                      position: 'relative'
                    }}
                  >
                    {item.img ? (
                      <LazyLoadImage
                        src={`cover://${item.img}`}
                        alt={item.foldername || 'Album cover'}
                        onError={({ currentTarget: image }) => {
                          if (image.getAttribute('src') === NoImage) return;
                          image.setAttribute('src', NoImage);
                          image.alt = 'Cover unavailable';
                          image.title =
                            'Cover image unavailable. Refresh Covers after restoring the folder.';
                        }}
                        width={`${estimatedSize}px`}
                        height={`${estimatedSize}px`}
                      />
                    ) : (
                      <img className={coverImageSize} src={NoImage} alt="" />
                    )}
                    <Overlay
                      //className={currentAlbum !== item.id ? 'overlay' : 'overlay active-album'}
                      coverTextSize={coverTextSize}
                      id={item.fullpath}
                      album={item.foldername}
                      currentAlbum={currentAlbum}
                      fullpath={item.fullpath}
                    />
                  </div>
                );
              })}
              {coversLoading && hasMoreCovers && (
                <div
                  style={{
                    width: `${estimatedSize}px`,
                    height: `${estimatedSize}px`,
                    zIndex: '100',
                    backgroundColor: 'var(--covers-loading)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  Loading
                </div>
              )}
              {coversError && (
                <div
                  style={{
                    width: `${estimatedSize}px`,
                    height: `${estimatedSize}px`,
                    zIndex: '100',
                    backgroundColor: 'red',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  Errors loading covers
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AlbumsCoverView;
