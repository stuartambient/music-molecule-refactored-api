// Run with node --test scripts/testPlaybackRecovery.mjs. No music files or catalog are modified.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import reducer from '../src/renderer/src/audioPlayerReducer.js';
import { getAdjacentTrack, getPlaybackQueue } from '../src/renderer/src/utility/playbackState.js';
import { createPlaybackSession } from '../src/renderer/src/utility/playbackSession.js';
import handleTrackSelect from '../src/renderer/src/utility/audioUtils.js';

const track = (id) => ({ track_id: id, audiotrack: id + '.mp3', title: id, like: 1 });
const a = track('a'),
  b = track('b'),
  c = track('c');
function initial(queue = [a, b, c]) {
  return {
    tracks: [],
    playlistTracks: queue,
    active: '',
    activeList: '',
    newtrack: '',
    playbackTrack: null,
    playbackQueue: [],
    playbackRequest: 0,
    playbackError: null,
    pendingAdvance: null,
    tracksHasMore: false,
    tracksPageNumber: 0,
    pause: true
  };
}
const select = (state, entry, index, list = 'playlistActive', play = true) =>
  reducer(state, { type: 'select-track', track: entry, index, list, play });
const fail = (state) =>
  reducer(state, {
    type: 'playback-error',
    request: state.playbackRequest,
    error: { message: 'Decode failed' }
  });

test('playlist advancement uses its own sequence even when the library is empty or hidden', () => {
  let state = select(initial(), a, 0);
  state = { ...state, listType: 'albums', library: false, listScroll: false };
  state = reducer(state, { type: 'advance-track', direction: 1 });
  assert.equal(state.active, 'b');
  assert.equal(state.newtrack, 1);
  assert.equal(state.pause, false);
  state = reducer(state, { type: 'advance-track', direction: -1 });
  assert.equal(state.active, 'a');
  assert.equal(state.newtrack, 0);
});

test('a failed track pauses, retains its queue, and retries the same source with a fresh request', () => {
  const selected = select(initial(), b, 1);
  const failed = fail(selected);
  assert.equal(failed.pause, true);
  assert.equal(failed.active, 'b');
  assert.equal(failed.playlistTracks, selected.playlistTracks);
  const retried = reducer(failed, { type: 'retry-track' });
  assert.equal(retried.active, 'b');
  assert.equal(retried.newtrack, 1);
  assert.equal(retried.pause, false);
  assert.equal(retried.playbackError, null);
  assert.equal(retried.playbackRequest, selected.playbackRequest + 1);
});

test('consecutive failures can be skipped one at a time and the final failure never wraps', () => {
  let state = fail(select(initial(), a, 0));
  state = reducer(state, { type: 'advance-track', direction: 1 });
  assert.equal(state.active, 'b');
  assert.equal(state.pause, false);
  state = fail(state);
  state = reducer(state, { type: 'advance-track', direction: 1 });
  assert.equal(state.active, 'c');
  state = fail(state);
  assert.equal(getAdjacentTrack(state, 1), null);
  assert.equal(reducer(state, { type: 'advance-track', direction: 1 }), state);
  assert.equal(state.pause, true);
  const reset = reducer(state, { type: 'reset', pause: true });
  assert.equal(reset.playbackTrack, null);
  assert.equal(reset.playbackError, null);
});

test('normal end-of-track advances once and pauses at the end of the queue', () => {
  const selected = select(initial(), b, 1);
  const ended = {
    type: 'advance-track',
    direction: 1,
    play: true,
    ended: true,
    request: selected.playbackRequest
  };
  const advanced = reducer(selected, ended);
  assert.equal(advanced.active, 'c');
  assert.equal(reducer(advanced, ended), advanced);
  const finished = reducer(advanced, { ...ended, request: advanced.playbackRequest });
  assert.equal(finished.active, 'c');
  assert.equal(finished.pause, true);
  assert.equal(finished.playbackError, null);
});

test('duplicate playlist entries use the selected occurrence', () => {
  const state = select(initial([a, a, b]), a, 1);
  const advanced = reducer(state, { type: 'advance-track', direction: 1 });
  assert.equal(advanced.active, 'b');
  assert.equal(advanced.newtrack, 2);
});

test('removing the current track or a preceding track keeps the correct successor', () => {
  const state = select(initial(), b, 1);
  for (const id of ['b', 'a']) {
    const removed = reducer(state, { type: 'remove-track', id });
    const next = reducer(removed, { type: 'advance-track', direction: 1 });
    assert.equal(next.active, 'c');
  }
});

test('stale artwork, like, metadata, error, and ended events cannot overwrite a newer selection', () => {
  const first = select(initial(), a, 0);
  const second = select(first, b, 1);
  const request = first.playbackRequest;
  for (const action of [
    { type: 'set-cover', cover: 'old' },
    { type: 'update-like', isLiked: false },
    { type: 'duration', duration: '99:99' },
    { type: 'set-delay', delay: true },
    { type: 'playback-error', error: { message: 'old failure' } },
    { type: 'advance-track', direction: 1, ended: true }
  ]) {
    assert.equal(reducer(second, { ...action, request }), second);
  }
});

test('clicking nested track text selects index zero from the anchor and can recover from an error', () => {
  let state = initial();
  const actions = [];
  const event = {
    preventDefault() {},
    currentTarget: { id: 'a', getAttribute: () => '0' },
    target: { id: '' }
  };
  handleTrackSelect(event, state, (action) => actions.push(action), { list: 'playlistActive' });
  state = reducer(state, actions[0]);
  assert.equal(state.active, 'a');
  assert.equal(state.newtrack, 0);
  assert.equal(state.pause, true);
  state = fail(state);
  handleTrackSelect(
    event,
    state,
    (action) => {
      state = reducer(state, action);
    },
    { list: 'playlistActive' }
  );
  assert.equal(state.pause, false);
  assert.equal(state.playbackError, null);
});

test('library playback keeps its sequence when a search replaces visible rows', () => {
  const state = select({ ...initial(), tracks: [a, b] }, a, 0, 'tracklistActive');
  const changed = reducer(state, { type: 'add-tracks', tracks: [c] });
  assert.deepEqual(getPlaybackQueue(changed), [a, b]);
  assert.equal(reducer(changed, { type: 'advance-track', direction: 1 }).active, 'b');
});

test('resetting library playback clears progress and ignores events from the old order', () => {
  const playing = {
    ...select({ ...initial(), tracks: [a, b, c] }, b, 1, 'tracklistActive'),
    duration: '03:00',
    delay: true,
    seeking: true,
    pendingAdvance: { play: true }
  };
  const reset = reducer(playing, { type: 'reset', pause: true });
  assert.equal(reset.playbackTrack, null);
  assert.deepEqual(reset.playbackQueue, []);
  assert.equal(reset.active, '');
  assert.equal(reset.activeList, '');
  assert.equal(reset.newtrack, '');
  assert.equal(reset.nextTrack, '');
  assert.equal(reset.prevTrack, '');
  assert.equal(reset.duration, '');
  assert.equal(reset.delay, false);
  assert.equal(reset.seeking, false);
  assert.equal(reset.isLiked, false);
  assert.equal(reset.pendingAdvance, null);
  assert.equal(reset.pause, true);
  for (const action of [
    { type: 'duration', duration: '03:00' },
    { type: 'set-cover', cover: 'old artwork' },
    { type: 'set-delay', delay: true },
    { type: 'advance-track', direction: 1, ended: true, play: true }
  ]) {
    assert.equal(reducer(reset, { ...action, request: playing.playbackRequest }), reset);
  }

  const reordered = reducer(reset, { type: 'add-tracks', tracks: [c, b, a] });
  assert.equal(reordered.playbackTrack, null);
  assert.equal(reducer(reordered, { type: 'pauseplay' }), reordered);
  const selected = reducer(reordered, {
    type: 'select-track',
    track: c,
    index: 0,
    list: 'tracklistActive'
  });
  assert.equal(selected.active, 'c');
  assert.equal(selected.pause, true);
  assert.equal(reducer(selected, { type: 'pauseplay' }).pause, false);
});

test('sorting resets active Tracks playback with either shuffle flag enabled or disabled', () => {
  for (const tracksShuffle of [false, true]) {
    for (const playlistShuffle of [false, true]) {
      for (const pause of [false, true]) {
        const playing = {
          ...select({ ...initial(), tracks: [a, b, c] }, b, 1, 'tracklistActive'),
          tracksShuffle,
          playlistShuffle,
          tracksPageNumber: 3,
          pause,
          pendingAdvance: { play: true }
        };
        const sorted = reducer(playing, { type: 'sort-tracks' });
        assert.equal(sorted.playbackTrack, null);
        assert.equal(sorted.active, '');
        assert.equal(sorted.newtrack, '');
        assert.equal(sorted.pause, true);
        assert.equal(sorted.tracksShuffle, false);
        assert.equal(sorted.playlistShuffle, playlistShuffle);
        assert.equal(sorted.tracksPageNumber, 0);
        assert.deepEqual(sorted.tracks, []);
        assert.equal(sorted.pendingAdvance, null);
        const reloaded = reducer(sorted, { type: 'add-tracks', tracks: [c, b, a] });
        assert.equal(reloaded.playbackTrack, null);
        assert.equal(reloaded.pause, true);
      }
    }
  }
});

test('sorting Tracks preserves playback from another list', () => {
  const playing = select(initial(), b, 1);
  const sorted = reducer(playing, { type: 'sort-tracks' });
  assert.equal(sorted.playbackTrack, b);
  assert.equal(sorted.playbackRequest, playing.playbackRequest);
  assert.equal(sorted.pause, false);
});

test('advancement fetches the next library page without scrolling and resumes when it arrives', () => {
  let state = select({ ...initial(), tracks: [a], tracksHasMore: true }, a, 0, 'tracklistActive');
  state = reducer(state, { type: 'advance-track', direction: 1, ended: true, play: true });
  assert.equal(state.tracksPageNumber, 1);
  assert.ok(state.pendingAdvance);
  assert.equal(reducer(state, { type: 'advance-track', direction: 1 }), state);
  const next = reducer(state, { type: 'tracks-playlist', tracks: [b] });
  assert.equal(next.active, 'b');
  assert.equal(next.pause, false);
  assert.equal(next.pendingAdvance, null);
  const failed = reducer(state, {
    type: 'tracks-load-failed',
    error: { message: 'Page unavailable' }
  });
  assert.equal(failed.pause, true);
  assert.equal(failed.pendingAdvance, null);
  assert.equal(failed.playbackError.message, 'Page unavailable');
});

class FakeAudio extends EventTarget {
  src = '';
  paused = true;
  error = null;
  loadCount = 0;
  playImplementation = () => Promise.resolve();
  play() {
    this.paused = false;
    return this.playImplementation();
  }
  pause() {
    this.paused = true;
  }
  load() {
    this.loadCount++;
    this.error = null;
  }
  removeAttribute(name) {
    if (name === 'src') this.src = '';
  }
}
function fixture() {
  const audio = new FakeAudio(),
    errors = [],
    ended = [],
    metadata = [];
  const callbacks = {
    onError: (error) => errors.push(error),
    onEnded: () => ended.push(true),
    onMetadata: (element) => metadata.push(element),
    onSeeking() {},
    onVolume() {}
  };
  return { audio, errors, ended, metadata, callbacks };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('media errors and rejected play promises produce one visible failure and stop advancement', async () => {
  for (const code of [1, 2, 3, 4]) {
    const { audio, errors, ended, callbacks } = fixture();
    audio.playImplementation = () => Promise.reject(new Error('play rejected'));
    const session = createPlaybackSession(audio, 'streaming://failed.mp3', callbacks);
    session.play();
    audio.error = { code, message: 'native failure' };
    audio.dispatchEvent(new Event('error'));
    audio.dispatchEvent(new Event('ended'));
    await tick();
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, code);
    assert.equal(audio.paused, true);
    assert.equal(ended.length, 0);
    session.dispose();
  }
});

test('play promise failures without a media error are surfaced', async () => {
  const { audio, errors, callbacks } = fixture();
  audio.playImplementation = () => Promise.reject(new Error('Output device failed'));
  const session = createPlaybackSession(audio, 'streaming://track.mp3', callbacks);
  session.play();
  await tick();
  assert.equal(errors.length, 1);
  assert.equal(errors[0].detail, 'Output device failed');
  assert.equal(audio.paused, true);
  session.dispose();
});

test('late rejection from a replaced source cannot stop the new track', async () => {
  const { audio, errors, callbacks } = fixture();
  let reject;
  audio.playImplementation = () =>
    new Promise((_resolve, rejection) => {
      reject = rejection;
    });
  const old = createPlaybackSession(audio, 'streaming://old.mp3', callbacks);
  old.play();
  old.dispose();
  audio.playImplementation = () => Promise.resolve();
  const current = createPlaybackSession(audio, 'streaming://new.mp3', callbacks);
  current.play();
  reject(new Error('Old source aborted'));
  await tick();
  assert.equal(errors.length, 0);
  assert.equal(audio.src, 'streaming://new.mp3');
  assert.equal(audio.paused, false);
  current.dispose();
});

test('pause and resume ignore the earlier aborted play request', async () => {
  const { audio, errors, callbacks } = fixture();
  let reject;
  audio.playImplementation = () =>
    new Promise((_resolve, rejection) => {
      reject = rejection;
    });
  const session = createPlaybackSession(audio, 'streaming://track.mp3', callbacks);
  session.play();
  session.pause();
  audio.playImplementation = () => Promise.resolve();
  session.play();
  reject(new Error('Aborted by pause'));
  await tick();
  assert.equal(errors.length, 0);
  assert.equal(audio.paused, false);
  session.dispose();
});

test('retry creates a fresh media load and normal metadata/ended events work afterward', () => {
  const { audio, errors, ended, metadata, callbacks } = fixture();
  const failed = createPlaybackSession(audio, 'streaming://track.mp3', callbacks);
  audio.error = { code: 3 };
  audio.dispatchEvent(new Event('error'));
  failed.dispose();
  const retry = createPlaybackSession(audio, 'streaming://track.mp3', callbacks);
  retry.play();
  audio.dispatchEvent(new Event('loadedmetadata'));
  audio.dispatchEvent(new Event('ended'));
  assert.equal(errors.length, 1);
  assert.equal(metadata.length, 1);
  assert.equal(ended.length, 1);
  assert.equal(audio.loadCount, 3);
  retry.dispose();
  audio.error = { code: 4 };
  audio.dispatchEvent(new Event('error'));
  assert.equal(errors.length, 1);
});
