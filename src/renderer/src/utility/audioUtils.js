import { Buffer } from 'buffer';

export const handlePicture = (buffer) => {
  if (!buffer) return;
  const bufferToString = Buffer.from(buffer).toString('base64');
  return `data:${buffer.format || 'image/jpeg'};base64,${bufferToString}`;
};

const handleTrackSelect = (event, state, dispatch, details) => {
  event.preventDefault();
  const target = event.currentTarget || event.target;
  const id = target.id || details.active;
  const index = Number(target.getAttribute('data-val'));
  const list = details.list;
  const queue = list === 'playlistActive' ? state.playlistTracks : state.tracks;
  const track =
    queue[index]?.track_id === id ? queue[index] : queue.find((entry) => entry.track_id === id);
  if (!track) return;
  if (
    state.active === id &&
    state.activeList === list &&
    state.newtrack === index &&
    !state.playbackError
  )
    return;
  dispatch({ type: 'select-track', track, index, list });
};

export default handleTrackSelect;
