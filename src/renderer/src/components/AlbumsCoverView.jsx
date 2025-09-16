import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import classNames from 'classnames';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { useAudioPlayer } from '../mainAudioContext';
import { useAllAlbumsCovers } from '../hooks/useDb';
import handleTrackSelect from '../utility/audioUtils';
import NoImage from '../assets/noimage.jpg';
import { useVirtualizer } from '@tanstack/react-virtual';
const Overlay = React.lazy(() => import('./Overlay'));
import { openChildWindow } from './ChildWindows/openChildWindow';
//import Overlay from './Overlay';
import '../style/AlbumsCoverView.css';

const AlbumsCoverView = ({ /* resetKey,  */ coverSize, className }) => {
  const { state, dispatch } = useAudioPlayer();
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
    state.covers.length
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
    setCurrentAlbum('');
    state.audioRef.current.src = '';
    dispatch({
      type: 'stop-this-album'
    });
    dispatch({
      type: 'newtrack',
      pause: true,
      newtrack: '',
      artist: '',
      title: '',
      album: '',
      active: '',
      nextTrack: '',
      prevTrack: ''
    });
  }, [setCurrentAlbum, state.audioRef, dispatch]);

  const handlePlayReq = useCallback(
    async (event, id) => {
      setCurrentAlbum(id);
      const albumTracks = await window.api.getAlbumTracks(id);

      if (albumTracks) {
        dispatch({
          type: 'play-this-album',
          playlistTracks: albumTracks,
          list: 'playlistActive'
        });

        const fakeEvent = {
          target: {
            id: albumTracks[0].track_id,
            getAttribute: (attr) => {
              if (attr === 'val') {
                return 0;
              }
              return null; // Return null for any other attribute
            }
          },
          preventDefault: () => {
            console.log('preventDefault() called');
          }
        };
        handleTrackSelect(fakeEvent, state, dispatch, {
          artist: albumTracks[0].performers ? albumTracks[0].performers : 'not available',
          title: albumTracks[0].title ? albumTracks[0].title : albumTracks[0].audiotrack,
          album: albumTracks[0].album ? albumTracks[0].album : 'not available',
          audiofile: albumTracks[0].audiotrack,
          like: albumTracks[0].like,
          active: albumTracks[0].track_id,
          list: 'playlistActive'
        });
        /* setTimeout(() => dispatch({ type: 'start-album' }), 2000); */
        dispatch({ type: 'start-album' });
      }
    },
    [dispatch, state]
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
        window.api.showAlbumCoverMenu(path, folder);
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
  }, [currentAlbum, handlePlayReq, stopAlbumPlay]);

  const handleAlbumToPlaylist = useCallback(
    async (path) => {
      const albumTracks = await window.api.getAlbumTracks(path);
      if (albumTracks) {
        dispatch({
          type: 'play-album',
          playlistTracks: albumTracks
        });
      }
    },
    [dispatch]
  );

  useEffect(() => {
    const sendOpenFolder = async () => {
      return await window.api.openAlbumFolder(openFolder);
    };
    if (openFolder) {
      sendOpenFolder();
    }
    setTimeout(() => setOpenFolder(''), 1000);
  }, [openFolder]);

  useEffect(() => {
    const handleContextMenu = (option) => {
      const [menuoption, path, album] = option;

      switch (menuoption) {
        case 'add album to playlist': {
          return handleAlbumToPlaylist(path);
        }
        case 'open album folder': {
          //window.api.openAlbumFolder(path);
          //if (process.env.NODE_ENV === 'development') {
          if (openFolder === path) return;
          setOpenFolder(path);
          // } else {
          //  window.api.openAlbumFolder(path);
          //  }
          break;
        }
        case 'cover search': {
          const regex = /(\([^)]*\)|\[[^\]]*\]|\{[^}]*\})/g;
          const refAlbum = album.replace(regex, '');
          return handleCoverSearch({ path: path, album: refAlbum, service: 'covit' });
        }
        default:
          return;
      }
    };

    window.api.onAlbumCoverMenu(handleContextMenu);

    return () => {
      window.api.off('album-menu', handleContextMenu);
    };
  }, [handleAlbumToPlaylist, openFolder]);

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

  const handleCoverSearch = async (search) => {
    console.log('search: ', search);
    const { album, path, service } = search;

    let artist, title;
    if (album.includes('-')) {
      [artist, title] = album
        .split('-')
        .map((part) => part.replaceAll(/\W/g, ' ').replaceAll('and', ' '));
    } else {
      title = album;
    }

    /*   if (!artist) return; */

    if (service === 'covit') {
      return openChildWindow(
        'cover-search-alt',
        'cover-search-alt',
        {
          width: 1400,
          height: 600,
          show: false,
          resizable: true,
          preload: 'coverSearchAlt',
          sandbox: true,
          webSecurity: true,
          contextIsolation: true
        },
        { artist, title, path }
      );
    }
  };

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
                      /*    <img
                        className={coverImageSize}
                        src={`cover://${item.img}`}
                        alt=""
                        loading="lazy"
                      /> */
                      <LazyLoadImage
                        src={`cover://${item.img}`}
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
