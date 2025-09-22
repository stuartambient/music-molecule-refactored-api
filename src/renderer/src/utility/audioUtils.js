import { Buffer } from 'buffer';

export const handlePicture = (buffer) => {
  if (!buffer) return;
  const bufferToString = Buffer.from(buffer).toString('base64');
  return `data:${buffer.format};base64,${bufferToString}`;
};

export const unloadFile = async (state) => {
  /*  console.log('state: ', state); */
  try {
    state.audioRef.current.src = '';
  } catch (error) {
    console.error(error);
  }
};

const loadFile = async (file, id, state, dispatch) => {
  try {
    state.audioRef.current.src = await `streaming://${file}`;
    /* const buf = await state.audioRef.current.src.arrayBuffer(); */
  } catch (e) {
    console.log(e);
  }
  const picture = await window.ipcApi.invoke('get-cover', file);

  if (picture === 0 || !picture) {
    dispatch({
      type: 'set-cover',
      cover: 'not available'
    });
  } else {
    dispatch({
      type: 'set-cover',
      cover: handlePicture(picture)
    });
  }
  state.audioRef.current.load();
  if (!state.pause) {
    state.audioRef.current.play();
  }
};

/* const handleTrackSelect = (event, state, dispatch, ...params) => {
  event.preventDefault();
  console.log('params: ', event.target.id);

  if (event.target.id) {
    if (event.target.id === state.active) {
      return;
    }
  }

  const current = state.tracks.find((track) => track.audiotrack === params[0].audiofile);
  console.log('current: ', current);

  dispatch({
    type: 'newtrack',
    pause: state.pause,
    newtrack: event.target.getAttribute('val'),
    artist: params[0].artist,
    title: params[0].title,
    album: params[0].album,
    active: event.target.id || params[0].active,
    nextTrack: '',
    prevTrack: '',
    isLiked: current.like === 1 ? true : false,
    activeList: params[0].list
  });

  dispatch({
    type: 'direction',
    playNext: false,
    playPrev: false
  });
  try {
    loadFile(params[0].audiofile, event.target.id, state, dispatch);
  } catch (error) {
    console.error('error: ', error);
  }
}; */

const handleTrackSelect = async (event, state, dispatch, ...params) => {
  console.log('event target: ', event.target, 'params: ', params);
  // 1. prevent the default
  event.preventDefault();
  // 2. pull anything you need off `event` now:
  const trackId = event.target.id;
  const val = event.target.getAttribute('val');
  console.log('val: ', val);

  // 3. short-circuit if they clicked the already-active track
  /*   if (listType === 'playlist' && activeList === 'tracklistActive') */
  if (
    trackId &&
    trackId === state.active &&
    state.listType === 'files' &&
    state.activeList === 'tracklistActive'
  ) {
    return;
  } else if (
    trackId &&
    trackId === state.active &&
    state.listType === 'playlist' &&
    state.activeList === 'playlistActive'
  ) {
    return;
  }

  // 4. find your current track in state (you were already doing this)
  /* const current = state.tracks.find((t) => t.audiotrack === params[0].audiofile); */

  // 5. ask the back end if it’s liked

  // 6. now dispatch with the real async result
  dispatch({
    type: 'newtrack',
    pause: state.pause,
    newtrack: val,
    artist: params[0].artist,
    title: params[0].title,
    album: params[0].album,
    active: trackId || params[0].active,
    nextTrack: '',
    prevTrack: '',
    isLiked: false /* liked.like === 1 ? true : false */,
    activeList: params[0].list,
    playNext: false,
    playPrev: false
  });

  try {
    const liked = await window.ipcApi.invoke('is-liked', trackId);
    dispatch({
      type: 'update-like',
      isLiked: liked.like === 1
    });
  } catch (err) {
    console.error('could not fetch like status', err);
  }

  /*   window.api.sendTrackNotification(trackNotification); */

  // 7. reset your direction state as before
  dispatch({
    type: 'direction',
    playNext: false,
    playPrev: false
  });

  // 8. and finally load the file
  try {
    loadFile(params[0].audiofile, trackId, state, dispatch);
  } catch (error) {
    console.error('error loading file:', error);
  }
};

export const handleManualChange = (track, state, dispatch) => {
  console.log('track: ', track, 'state: ', state);
  const listType = state.activeList === 'tracklistActive' ? state.tracks : state.playlistTracks;
  const newTrack = listType.findIndex((obj) => obj.track_id === track);
  console.log('newTrack: ', newTrack);
  const evt = {
    preventDefault: () => {
      console.log('preventDefault called');
    },
    target: {
      id: track,
      getAttribute: (attr) => {
        const attributes = {
          val: newTrack
        };
        return attributes[attr] || null;
      }
    }
  };
  return handleTrackSelect(evt, state, dispatch, {
    //newtrack: newTrack,
    artist: listType[newTrack].performers ? listType[newTrack].performers : 'not available',
    title: listType[newTrack].title ? listType[newTrack].title : listType[newTrack].audiotrack,
    album: listType[newTrack].album ? listType[newTrack].album : 'not available',
    audiofile: listType[newTrack].audiotrack,
    like: listType[newTrack].like,
    active: listType[newTrack].track_id,
    list: state.activeList
  });
};

export default handleTrackSelect;
