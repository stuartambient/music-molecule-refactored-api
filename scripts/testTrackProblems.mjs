import { test } from 'node:test';
import assert from 'node:assert/strict';
import reducer from '../src/renderer/src/audioPlayerReducer.js';
import { getTrackProblem } from '../src/renderer/src/utility/trackProblems.js';
const a = { track_id: 'a', audiotrack: 'D:/Music/a.mp3' },
  b = { track_id: 'b', audiotrack: 'D:/Music/b.mp3' };
const initial = () => ({
  tracks: [a, b],
  playlistTracks: [a, b],
  playbackQueue: [],
  playbackRequest: 0,
  playbackTrack: null,
  pause: true,
  playbackBackend: 'mpv',
  trackProblems: {}
});
const select = (s, t, index = 0) =>
  reducer(s, { type: 'select-track', track: t, index, list: 'playlistActive', play: false });
const fail = (s, error = { message: 'Decoder failed' }) =>
  reducer(s, { type: 'playback-error', request: s.playbackRequest, error });
test('known failures remain visible across selections, browsing and reloading a playlist', () => {
  let s = fail(select(initial(), a));
  s = select(s, b, 1);
  s = reducer(s, { type: 'set-list-type', listType: 'albums' });
  s = reducer(s, { type: 'load-playlist', playlistTracks: [b, a, a] });
  assert.equal(getTrackProblem(s, a).message, 'Decoder failed');
  assert.equal(getTrackProblem(s, b), null);
  assert.equal(getTrackProblem(s, { ...a, audiotrack: 'D:/Other/a.mp3' }), null);
});
test('a decoder failure is engine-specific and only a successful current retry clears it', () => {
  let s = fail(select(initial(), a));
  const oldRequest = s.playbackRequest;
  s = reducer(s, { type: 'retry-track' });
  assert.ok(getTrackProblem(s, a), 'retry must not prematurely clear the marker');
  s = reducer(s, { type: 'duration', request: oldRequest, duration: '01:00' });
  assert.ok(getTrackProblem(s, a), 'late metadata must not clear a newer failure');
  assert.equal(getTrackProblem({ ...s, playbackBackend: 'builtin' }, a), null);
  s = reducer(s, { type: 'duration', request: s.playbackRequest, duration: '01:00' });
  assert.equal(getTrackProblem(s, a), null);
});
test('unavailable files stay marked across engines; stale errors cannot poison other tracks', () => {
  let s = fail(select(initial(), a), { available: false, message: 'Drive unavailable' });
  assert.equal(getTrackProblem({ ...s, playbackBackend: 'builtin' }, a).backend, 'availability');
  const oldRequest = s.playbackRequest;
  s = select(s, b, 1);
  s = reducer(s, {
    type: 'playback-error',
    request: oldRequest,
    error: { message: 'Old response' }
  });
  assert.equal(getTrackProblem(s, b), null);
  assert.equal(getTrackProblem(s, a).message, 'Drive unavailable');
});
