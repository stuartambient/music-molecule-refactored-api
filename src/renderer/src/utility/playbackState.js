export function getPlaybackQueue(state) {
  if (state.activeList === 'playlistActive') return state.playlistTracks;
  if (state.activeList === 'tracklistActive') {
    return state.tracks.some((track) => track.track_id === state.active)
      ? state.tracks
      : state.playbackQueue || [];
  }
  return [];
}

export function getPlaybackPosition(state, queue = getPlaybackQueue(state)) {
  const index = Number.isInteger(state.newtrack) ? state.newtrack : -1;
  if (index >= 0 && queue[index]?.track_id === state.active) return index;
  return queue.findIndex((track) => track.track_id === state.active);
}

export function getAdjacentTrack(state, direction) {
  if (!state.active) return null;
  const queue = getPlaybackQueue(state);
  const position = getPlaybackPosition(state, queue);
  // Removing the current playlist entry moves its successor into the same index.
  const index =
    position < 0 ? Number(state.newtrack) + (direction > 0 ? 0 : -1) : position + direction;
  return queue[index] ? { track: queue[index], index, queue } : null;
}

export function selectPlaybackTrack(state, { track, index, list, queue, play }) {
  if (!track?.track_id || !track.audiotrack) return state;
  const sequence = queue || (list === 'playlistActive' ? state.playlistTracks : state.tracks);
  const position =
    sequence[index]?.track_id === track.track_id
      ? index
      : sequence.findIndex((entry) => entry.track_id === track.track_id);
  return {
    ...state,
    active: track.track_id,
    activeList: list,
    newtrack: position,
    playbackTrack: track,
    playbackQueue: sequence,
    playbackRequest: state.playbackRequest + 1,
    playbackError: null,
    pendingAdvance: null,
    pause: play === undefined ? (state.playbackError ? false : state.pause) : !play,
    artist: track.performers || 'not available',
    title: track.title || track.audiotrack,
    album: track.album || 'not available',
    isLiked: track.like === 1,
    cover: 'not available',
    duration: '',
    delay: false,
    seeking: false,
    nextTrack: sequence[position + 1]?.track_id || '',
    prevTrack: sequence[position - 1]?.track_id || '',
    playNext: false,
    playPrev: false
  };
}

export function advancePlayback(state, action) {
  if (action.request !== undefined && action.request !== state.playbackRequest) return state;
  const next = getAdjacentTrack(state, action.direction);
  if (!next) {
    const canLoadMore =
      action.direction > 0 &&
      state.activeList === 'tracklistActive' &&
      state.tracksHasMore &&
      state.tracks.some((track) => track.track_id === state.active);
    if (canLoadMore) {
      if (state.pendingAdvance) return state;
      return {
        ...state,
        pendingAdvance: { play: action.play ?? (state.playbackError ? true : !state.pause) },
        tracksPageNumber: state.tracksPageNumber + 1
      };
    }
    return action.ended ? { ...state, pause: true } : state;
  }
  return selectPlaybackTrack(state, {
    ...next,
    list: state.activeList,
    play: action.play ?? (state.playbackError ? true : undefined)
  });
}
