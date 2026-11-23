/* global EventTarget, Event, setImmediate */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import reducer from '../src/renderer/src/audioPlayerReducer.js';
import { createAvailablePlayback } from '../src/renderer/src/utility/availablePlayback.js';
import { createPlaybackSession } from '../src/renderer/src/utility/playbackSession.js';

const tracks = ['a', 'b', 'c'].map((id) => ({ track_id: id, audiotrack: `${id}.flac` }));
const initial = () => ({
  tracks,
  playlistTracks: tracks,
  playbackRequest: 0,
  listSelections: {},
  pause: true
});
const select = (state, index, list, extra = {}) =>
  reducer(state, {
    type: 'select-track',
    track: tracks[index],
    index,
    list,
    queue: tracks,
    play: true,
    ...extra
  });
const sample = (state, position) => ({ request: state.playbackRequest, position });

test('each source resumes its own time, including the same song in different lists', () => {
  let state = select(initial(), 0, 'tracklistActive');
  state = select(state, 0, 'playlistActive', { playbackSnapshot: sample(state, 85.5) });
  state = select(state, 1, 'albumTracksActive', {
    albumPath: 'Album',
    playbackSnapshot: sample(state, 40)
  });
  state = select(state, 0, 'tracklistActive', { playbackSnapshot: sample(state, 12) });
  assert.equal(state.playbackStartTime, 85.5);
  assert.equal(state.listSelections.playlistActive.position, 40);
  state = select(state, 0, 'playlistActive');
  assert.equal(state.playbackStartTime, 40);
  state = select(state, 1, 'albumTracksActive', { albumPath: 'Album' });
  assert.equal(state.playbackStartTime, 12);
});

test('completed album tracks stay completed across snapshots and other playback until selected again', () => {
  let state = select(initial(), 0, 'albumTracksActive', { albumPath: 'Album' });
  state = reducer(state, { type: 'pauseplay', playbackSnapshot: sample(state, 40) });
  assert.equal(state.listSelections.albumTracksActive.completed, undefined);
  state = reducer(state, {
    type: 'advance-track',
    ended: true,
    direction: 1,
    request: state.playbackRequest
  });
  assert.equal(state.listSelections.albumTracksActive.completed, true);
  assert.equal(state.listSelections.albumTracksActive.position, 0);
  state = select(state, 1, 'playlistActive', { playbackSnapshot: sample(state, 180) });
  assert.equal(state.listSelections.albumTracksActive.completed, true);
  assert.equal(state.listSelections.albumTracksActive.position, 0);
  state = select(state, 0, 'albumTracksActive', { albumPath: 'Album', resume: true });
  assert.notEqual(state.listSelections.albumTracksActive.completed, true);
  assert.equal(state.playbackStartTime, 0);
  assert.equal(state.pause, false);
  const stale = reducer(state, {
    type: 'advance-track',
    ended: true,
    direction: 1,
    request: state.playbackRequest - 1
  });
  assert.equal(stale, state);
});

test('choosing another track or another album starts at zero', () => {
  let state = select(initial(), 0, 'albumTracksActive', { albumPath: 'Album' });
  state = select(state, 1, 'playlistActive', { playbackSnapshot: sample(state, 85) });
  assert.equal(select(state, 2, 'albumTracksActive', { albumPath: 'Album' }).playbackStartTime, 0);
  assert.equal(select(state, 0, 'albumTracksActive', { albumPath: 'Other' }).playbackStartTime, 0);
  state = select(state, 0, 'tracklistActive');
  assert.equal(
    select(state, 1, 'tracklistActive', { playbackSnapshot: sample(state, 50) }).playbackStartTime,
    0
  );
});

test('unavailable or still-loading tracks keep the saved time through switching and Retry', () => {
  let state = select(initial(), 0, 'tracklistActive');
  state = select(state, 1, 'playlistActive', { playbackSnapshot: sample(state, 85) });
  state = select(state, 0, 'tracklistActive');
  const failed = reducer(state, {
    type: 'playback-error',
    request: state.playbackRequest,
    error: { message: 'Drive asleep' },
    playbackSnapshot: sample(state, undefined)
  });
  assert.equal(reducer(failed, { type: 'retry-track' }).playbackStartTime, 85);
  assert.equal(reducer(failed, { type: 'pauseplay' }).playbackStartTime, 85);
  state = select(failed, 1, 'playlistActive', { playbackSnapshot: sample(failed, undefined) });
  state = select(state, 0, 'tracklistActive');
  assert.equal(state.playbackStartTime, 85);
});

test('failure after playback retains the latest time, while stale snapshots cannot change it', () => {
  let state = select(initial(), 0, 'tracklistActive');
  state = reducer(state, {
    type: 'playback-error',
    request: state.playbackRequest,
    error: {},
    playbackSnapshot: sample(state, 94)
  });
  assert.equal(reducer(state, { type: 'retry-track' }).playbackStartTime, 94);
  const stale = sample(state, 1);
  state = reducer(state, { type: 'retry-track' });
  state = select(state, 1, 'playlistActive', { playbackSnapshot: stale });
  assert.equal(state.listSelections.tracklistActive.position, 94);
});

test('completed tracks restart at zero; sort, shuffle resets and Stop clear saved times', () => {
  for (const list of ['tracklistActive', 'playlistActive', 'albumTracksActive']) {
    let state = select(initial(), 2, list, { albumPath: 'Album' });
    state = reducer(state, {
      type: 'advance-track',
      direction: 1,
      ended: true,
      request: state.playbackRequest,
      playbackSnapshot: sample(state, 180)
    });
    state = select(state, 0, list === 'playlistActive' ? 'tracklistActive' : 'playlistActive');
    state = select(state, 2, list, { albumPath: 'Album' });
    assert.equal(state.playbackStartTime, 0);
  }
  let state = select(initial(), 0, 'tracklistActive');
  state = select(state, 1, 'playlistActive', { playbackSnapshot: sample(state, 85) });
  for (const action of [
    { type: 'sort-tracks' },
    { type: 'reset', selectionList: 'tracklistActive', pause: true },
    { type: 'reset', pause: true }
  ]) {
    assert.equal(select(reducer(state, action), 0, 'tracklistActive').playbackStartTime, 0);
  }
});

class Audio extends EventTarget {
  currentTime = 0;
  duration = 180;
  seeking = false;
  plays = [];
  paused = true;
  pause() {
    this.paused = true;
  }
  play() {
    this.paused = false;
    this.plays.push(this.currentTime);
    return Promise.resolve();
  }
  load() {
    this.currentTime = 0;
  }
  removeAttribute() {}
}
const callbacks = () => ({
  onMetadata() {},
  onError(error) {
    throw new Error(error.message);
  },
  onEnded() {},
  onSeeking() {},
  onVolume() {}
});
const emit = (audio, event) => audio.dispatchEvent(new Event(event));
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('restoration waits for metadata and seek completion before playing', () => {
  const audio = new Audio();
  const session = createPlaybackSession(audio, 'track', callbacks(), { startTime: 85 });
  session.play();
  assert.deepEqual(audio.plays, []);
  assert.equal(session.getPosition(), undefined);
  audio.seeking = true;
  emit(audio, 'loadedmetadata');
  assert.equal(audio.currentTime, 85);
  assert.deepEqual(audio.plays, []);
  assert.equal(session.getPosition(), undefined);
  audio.seeking = false;
  emit(audio, 'seeked');
  assert.deepEqual(audio.plays, [85]);
  assert.equal(session.getPosition(), 85);
  session.dispose();
});

test('pausing during delayed restoration prevents autoplay; a shorter replacement starts at zero', () => {
  const audio = new Audio();
  const session = createPlaybackSession(audio, 'track', callbacks(), { startTime: 200 });
  session.play();
  session.pause();
  emit(audio, 'loadedmetadata');
  assert.equal(audio.currentTime, 0);
  assert.deepEqual(audio.plays, []);
  session.play();
  assert.deepEqual(audio.plays, [0]);
  session.dispose();
});

test('a delayed availability result preserves the target and a disposed session cannot seek later', async () => {
  let resolve;
  const response = new Promise((done) => {
    resolve = done;
  });
  const audio = new Audio();
  const old = createAvailablePlayback(audio, 'old', () => response, callbacks(), { startTime: 85 });
  old.play();
  assert.equal(old.getPosition(), undefined);
  await tick();
  resolve({ available: true });
  await tick();
  emit(audio, 'loadedmetadata');
  assert.equal(audio.currentTime, 85);
  old.dispose();
  const current = createPlaybackSession(audio, 'new', callbacks(), { startTime: 40 });
  current.play();
  emit(audio, 'loadedmetadata');
  assert.equal(audio.currentTime, 40);
  assert.equal(old.getPosition(), undefined);
  current.dispose();
});
