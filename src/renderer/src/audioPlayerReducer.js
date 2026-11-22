import {
  advancePlayback,
  selectPlaybackTrack,
  rememberPlaybackPosition,
  rememberedPlaybackTime,
  getAdjacentTrack
} from './utility/playbackState.js';
import { recordTrackProblem, clearTrackProblem } from './utility/trackProblems.js';
import { withoutListSelection } from './utility/listSelection.js';

function setPlaylistGapless(state, enabled) {
  if (state.playlistGapless === enabled) return state;
  const active = state.activeList === 'playlistActive' && state.playbackTrack;
  return {
    ...state,
    playlistGapless: enabled,
    gaplessBypass: false,
    gaplessTransition: null,
    ...(active
      ? {
          playbackStartTime: rememberedPlaybackTime(state),
          playbackRequest: state.playbackRequest + 1,
          playbackError: null,
          duration: '',
          delay: false
        }
      : {})
  };
}

const audioPlayerReducer = (state, action) => {
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
    ].includes(action.type) &&
    (action.request === undefined || action.request === state.playbackRequest)
  ) {
    state = rememberPlaybackPosition(state, action.playbackSnapshot, action.ended);
  }
  if (action === 'set-next-track') {
    console.log('action: ', action);
  }
  switch (action.type) {
    case 'set-playback-backend':
    case 'hydrate-playback-backend': {
      if (action.type === 'hydrate-playback-backend' && state.backendPreferenceRevision)
        return state;
      const backend = action.backend === 'mpv' ? 'mpv' : 'builtin';
      if (backend === (state.playbackBackend || 'builtin')) return state;
      return {
        ...state,
        playbackBackend: backend,
        backendPreferenceRevision:
          action.type === 'set-playback-backend'
            ? (state.backendPreferenceRevision || 0) + 1
            : state.backendPreferenceRevision || 0,
        gaplessTransition: null,
        mpvTransition: null,
        gaplessBypass: false,
        ...(state.playbackTrack
          ? {
              playbackStartTime: rememberedPlaybackTime(state),
              playbackRequest: state.playbackRequest + 1,
              playbackError: null,
              duration: '',
              delay: false
            }
          : {})
      };
    }
    case 'mpv-transition': {
      if (
        state.playbackBackend !== 'mpv' ||
        state.activeList === 'albumTracksActive' ||
        action.request !== state.playbackRequest
      )
        return state;
      const next = getAdjacentTrack(state, 1);
      if (
        !next ||
        next.index !== action.index ||
        next.track.track_id !== action.trackId ||
        next.track.audiotrack !== action.trackPath
      )
        return state;
      return {
        ...selectPlaybackTrack(rememberPlaybackPosition(state, null, true), {
          ...next,
          list: state.activeList,
          play: true
        }),
        mpvTransition: action.token
      };
    }
    case 'toggle-playlist-gapless':
      return {
        ...setPlaylistGapless(state, !state.playlistGapless),
        gaplessPreferenceRevision: (state.gaplessPreferenceRevision || 0) + 1
      };
    case 'hydrate-playlist-gapless':
      return state.gaplessPreferenceRevision ? state : setPlaylistGapless(state, action.enabled);
    case 'gapless-transition': {
      if (
        !state.playlistGapless ||
        state.activeList !== 'playlistActive' ||
        action.request !== state.playbackRequest
      )
        return state;
      const next = getAdjacentTrack(state, 1);
      if (
        !next ||
        next.index !== action.index ||
        next.track.track_id !== action.trackId ||
        next.track.audiotrack !== action.trackPath
      )
        return state;
      const completed = rememberPlaybackPosition(state, null, true);
      return {
        ...selectPlaybackTrack(completed, { ...next, list: 'playlistActive', play: true }),
        gaplessTransition: action.token
      };
    }
    case 'gapless-fallback':
      return action.request === state.playbackRequest &&
        state.playlistGapless &&
        state.activeList === 'playlistActive'
        ? {
            ...state,
            gaplessBypass: true,
            gaplessTransition: null,
            playbackRequest: state.playbackRequest + 1,
            playbackStartTime: action.position || 0,
            duration: '',
            delay: false,
            musicNotice: {
              title: 'Standard playback for this track',
              message:
                (action.reason ? action.reason + ' ' : '') +
                'This track will use standard playback; gapless will be tried again on the next track.'
            }
          }
        : state;
    case 'music-notice':
      return { ...state, musicNotice: action.notice };
    case 'music-notice-result':
      return state.musicNotice?.id === action.id ? { ...state, musicNotice: action.notice } : state;
    case 'dismiss-music-notice':
      return { ...state, musicNotice: null };
    case 'library': {
      return { ...state, library: !state.library };
    }
    case 'pauseplay': {
      if (!state.playbackTrack) return state;
      if (state.playbackError)
        return {
          ...state,
          pendingAdvance: null,
          playbackStartTime: rememberedPlaybackTime(state),
          playbackError: null,
          playbackRequest: state.playbackRequest + 1,
          pause: false,
          delay: false
        };
      return {
        ...state,
        pause: !state.pause,
        pendingAdvance: state.pendingAdvance ? { play: state.pause } : null
      };
    }
    case 'select-track':
      return selectPlaybackTrack(state, action);
    case 'select-album': {
      const previous = state.listSelections?.albumTracksActive;
      return {
        ...state,
        listSelections: {
          ...state.listSelections,
          albumTracksActive:
            previous?.albumPath === action.albumPath ? previous : { albumPath: action.albumPath }
        }
      };
    }
    case 'advance-track':
      return advancePlayback(state, action);
    case 'retry-track':
      return state.playbackTrack
        ? {
            ...state,
            playbackStartTime: rememberedPlaybackTime(state),
            playbackError: null,
            playbackRequest: state.playbackRequest + 1,
            pause: false,
            delay: false,
            duration: ''
          }
        : state;
    case 'playback-error':
      return state.playbackTrack && action.request === state.playbackRequest
        ? {
            ...state,
            playbackError: action.error,
            trackProblems: recordTrackProblem(state, action.error),
            pause: true,
            delay: false,
            seeking: false
          }
        : state;

    case 'pause-on-empty': {
      return { ...state, pause: false };
    }
    case 'direction': {
      return {
        ...state,
        playNext: action.playNext,
        playPrev: action.playPrev
      };
    }
    case 'newtrack': {
      return {
        ...state,
        pause: action.pause,
        newtrack: +action.newtrack,
        artist: action.artist,
        title: action.title,
        album: action.album,
        cover: action.cover,
        active: action.active,
        nextTrack: action.nextTrack,
        prevTrack: action.prevTrack,
        isLiked: action.isLiked,
        activeList: action.activeList,
        playNext: action.playNext,
        playPrev: action.playPrev
        /* selectedTrackListType: action.selectedTrackListType */
      };
    }

    case 'reset': {
      return {
        ...state,
        listSelections: action.selectionList
          ? withoutListSelection(state, action.selectionList)
          : {},
        playbackAlbumPath: null,
        playbackTrack: null,
        playbackStartTime: 0,
        playbackQueue: [],
        playbackRequest: state.playbackRequest + 1,
        playbackError: null,
        pendingAdvance: null,
        delay: false,
        seeking: false,
        isLiked: false,
        newtrack: '',
        activeList: '',
        active: '',
        playNext: false,
        playPrev: false,
        nextTrack: '',
        prevTrack: '',
        artist: '',
        title: '',
        album: '',
        cover:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAyQAAAHGCAIAAAAKe9jzAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAQ9SURBVHhe7cGBAAAAAMOg+VMf4QJVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABw1AC4PgABfvY6uQAAAABJRU5ErkJggg==',
        duration: '',
        pause: action.pause
      };
    }
    case 'duration': {
      if (action.request !== undefined && action.request !== state.playbackRequest) return state;
      return {
        ...state,
        duration: action.duration,
        trackProblems:
          action.request === state.playbackRequest && !state.playbackError
            ? clearTrackProblem(state)
            : state.trackProblems
      };
    }

    case 'set-next-track': {
      /*       console.log('set-next-track payload', action.nextTrack); */
      return {
        ...state,
        nextTrack: action.nextTrack
      };
    }

    case 'set-prev-track': {
      return {
        ...state,
        prevTrack: action.prevTrack
      };
    }
    case 'set-cover': {
      if (action.request !== undefined && action.request !== state.playbackRequest) return state;
      return {
        ...state,
        cover: action.cover
      };
    }

    case 'set-delay': {
      if (action.request !== undefined && action.request !== state.playbackRequest) return state;
      return {
        ...state,
        delay: action.delay
      };
    }

    case 'set-page': {
      return {
        ...state,
        home: action.home,
        update: action.update,
        player: action.player,
        library: action.library,
        tagEditor: action.tagEditor,
        minimalmode: action.minimalmode,
        miniModePlaylist: action.miniModePlaylist
      };
    }

    case 'set-volume': {
      return {
        ...state,
        volume: action.volume
      };
    }
    case 'player-minimode': {
      return {
        ...state,
        minimalmode: action.minimalmode,
        home: action.home,
        update: action.update,
        player: action.player,
        tagEditor: action.tagEditor
      };
    }

    case 'tracks-playlist': {
      const next = {
        ...state,
        tracks: [...state.tracks, ...action.tracks],
        tracksHasMore: action.tracks.length === 200
      };
      return state.pendingAdvance
        ? advancePlayback(
            { ...next, pendingAdvance: null },
            { direction: 1, play: state.pendingAdvance.play, ended: true }
          )
        : next;
    }
    case 'add-tracks': {
      return { ...state, tracks: action.tracks, tracksHasMore: action.tracks.length === 200 };
    }
    case 'tracks-load-failed': {
      if (!state.pendingAdvance) return state;
      return {
        ...state,
        pendingAdvance: null,
        tracksHasMore: false,
        pause: true,
        playbackError: action.error
      };
    }

    case 'current-playlist': {
      return {
        ...state,
        /*  tracks: action.tracks */
        playlistTracks: [...state.playlistTracks, ...action.playlistTracks]
      };
    }

    case 'albums-playlist': {
      return {
        ...state,
        albums: [...state.albums, ...action.albums]
      };
    }
    case 'sort-tracks': {
      const next =
        state.activeList === 'tracklistActive'
          ? audioPlayerReducer(state, { type: 'reset', pause: true })
          : state;
      return {
        ...next,
        listSelections: withoutListSelection(state, 'tracklistActive'),
        tracksShuffle: false,
        tracksPageNumber: 0,
        tracks: [],
        tracksHasMore: false,
        pendingAdvance: null
      };
    }
    case 'reset-tracks': {
      return {
        ...state,
        tracksHasMore: false,
        pendingAdvance: null,
        tracks: action.tracks
      };
    }

    case 'reset-queue': {
      return {
        ...state,
        listSelections: {},
        playbackAlbumPath: null,
        playbackTrack: null,
        playbackQueue: [],
        playbackError: null,
        newtrack: '',
        nextTrack: '',
        prevTrack: '',
        active: ''
      };
    }

    case 'reset-albums': {
      return {
        ...state,
        albums: action.albums
      };
    }
    case 'tracks-pagenumber': {
      return {
        ...state,
        tracksPageNumber: action.tracksPageNumber
      };
    }
    case 'albums-pagenumber': {
      return {
        ...state,
        albumsPageNumber: action.albumsPageNumber
      };
    }
    case 'mini-mode-playlist': {
      return {
        ...state,
        miniModePlaylist: action.miniModePlaylist,
        library: action.library
      };
    }
    case 'exit-mini-to-full': {
      return {
        ...state,
        miniModePlaylist: action.miniModePlaylist,
        minimalmode: action.minimalmode
      };
    }
    case 'enter-mini-from-fullplaylist': {
      return {
        ...state,
        miniModePlaylist: action.miniModePlaylist,
        minimalmode: action.minimalmode
      };
    }

    case 'load-playlist': {
      return {
        ...state,
        playlistTracks: action.playlistTracks
      };
    }

    case 'play-album': {
      return {
        ...state,
        playlistTracks: [
          ...state.playlistTracks,
          ...action.playlistTracks.filter(
            (p) => !state.playlistTracks.find((d) => d.track_id === p.track_id)
          )
        ]
      };
    }

    case 'play-this-album': {
      return {
        ...state,
        playlistTracks: action.playlistTracks,
        listType: 'playlist',
        newtrack: 0,
        activeList: action.list
      };
    }

    case 'start-album': {
      return {
        ...state,
        pause: false
      };
    }

    case 'stop-this-album': {
      return {
        ...state,
        listSelections: withoutListSelection(state, 'playlistActive'),
        playbackAlbumPath: null,
        playbackTrack: null,
        playbackQueue: [],
        playbackError: null,
        playlistTracks: [],
        pause: true
      };
    }

    case 'pause-on-change': {
      return {
        ...state,
        pause: action.pause
      };
    }

    case 'track-to-playlist': {
      return {
        ...state,
        playlistTracks: [
          ...state.playlistTracks,
          ...action.playlistTracks.filter(
            (p) => !state.playlistTracks.find((d) => d.track_id === p.track_id)
          )
        ]
      };
    }

    case 'set-covers': {
      /* const key = 'fullpath'; */
      return {
        ...state,
        covers: [...state.covers, ...action.covers]
      };
    }

    case 'set-covers-pagenumber': {
      return {
        ...state,
        coversPageNumber: action.coversPageNumber
      };
    }

    case 'set-list-type': {
      return {
        ...state,
        listType: action.listType
      };
    }
    case 'playlist-clear': {
      return {
        ...state,
        listSelections: withoutListSelection(state, 'playlistActive'),
        playbackAlbumPath: null,
        playbackTrack: null,
        playbackQueue: [],
        playbackError: null,
        activeList: '',
        playlistTracks: action.playlistTracks,
        newtrack: action.newtrack,
        active: action.active,
        nextTrack: action.nextTrack,
        prevTrack: action.prevTrack,
        artist: action.artist,
        title: action.title,
        album: action.album,
        cover:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAyQAAAHGCAIAAAAKe9jzAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAQ9SURBVHhe7cGBAAAAAMOg+VMf4QJVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABw1AC4PgABfvY6uQAAAABJRU5ErkJggg==',
        duration: action.duration,
        pause: action.pause
      };
    }

    case 'remove-track': {
      return {
        ...state,
        playlistTracks: state.playlistTracks.filter((track) => track.track_id !== action.id)
      };
    }

    case 'mini-mode-info': {
      return {
        ...state,
        minimalmodeInfo: action.minimalmodeInfo
      };
    }

    case 'shuffle-reset': {
      return {
        ...state,
        newtrack: action.newtrack
      };
    }
    case 'tracks-shuffle': {
      return {
        ...state,
        tracksShuffle: action.tracksShuffle
      };
    }

    case 'playlist-shuffle': {
      return {
        ...state,
        playlistShuffle: action.playlistShuffle
      };
    }

    case 'seeking': {
      return { ...state, seeking: action.seeking };
    }
    case 'covers-date-sort': {
      return {
        ...state,
        coversDateSort: action.coversDateSort,
        covers: action.covers,
        coversPageNumber: action.coversPageNumber
      };
    }

    case 'covers-refresh': {
      return {
        ...state,
        coversMissingReq: action.coversMissingReq,
        covers: action.covers,
        coversPageNumber: action.coversPageNumber,
        coversSearchTerm: action.coversSearchTerm,
        coversDateSort: action.coversDateSort
      };
    }

    case 'config-options': {
      return {
        ...state,
        setup: action.setup
      };
    }

    case 'covers-missing-request': {
      return {
        ...state,
        covers: action.covers,
        coversPageNumber: action.coversPageNumber,
        coversMissingReq: action.coversMissingReq
      };
    }

    case 'covers-search-term': {
      return {
        ...state,
        coversSearchTerm: action.coversSearchTerm,
        covers: action.covers,
        coversPageNumber: action.coversPageNumber
      };
    }
    case 'flash-div': {
      return {
        ...state,
        flashDiv: action.flashDiv
      };
    }
    case 'reset-flash-div':
      return { ...state, flashDiv: null };

    case 'list-scroll-option':
      return {
        ...state,
        listScroll: !state.listScroll
      };

    case 'update-like':
      if (action.request !== undefined && action.request !== state.playbackRequest) return state;
      return {
        ...state,
        isLiked: action.isLiked
      };

    case 'tracks-update-like': {
      const { track_id, field, value } = action.payload;
      /*    console.log(track_id, field, value); */
      return {
        ...state,
        tracks: state.tracks.map((track) =>
          track.track_id === track_id
            ? {
                ...track,
                [field]: value
              }
            : track
        )
      };
    }

    case 'set-main-theme':
      return {
        ...state,
        mainTheme: action.mainTheme
      };

    default:
      throw new Error(`Unhandled action type: ${action.type}`);
  }
};

export default audioPlayerReducer;
