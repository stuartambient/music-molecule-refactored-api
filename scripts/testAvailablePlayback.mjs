import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAvailablePlayback } from '../src/renderer/src/utility/availablePlayback.js';
import {
  requestMusicTracks,
  availabilityNotice
} from '../src/renderer/src/utility/musicRequests.js';
import reducer from '../src/renderer/src/audioPlayerReducer.js';
import { getPlaybackQueue } from '../src/renderer/src/utility/playbackState.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
class Audio extends EventTarget {
  loads = 0;
  plays = 0;
  src = '';
  pause() {}
  load() {
    this.loads++;
  }
  play() {
    this.plays++;
    return Promise.resolve();
  }
  removeAttribute() {
    this.src = '';
  }
}
const missing = {
  available: false,
  reason: 'folder-unavailable',
  path: 'Z:/Music/a.mp3',
  message: 'Music folder unavailable'
};
function callbacks(errors) {
  return {
    onError: (e) => errors.push(e),
    onMetadata() {},
    onEnded() {},
    onSeeking() {},
    onVolume() {}
  };
}
test('an offline track pauses without attempting a media load, and Retry checks afresh', async () => {
  const audio = new Audio(),
    errors = [];
  const first = createAvailablePlayback(
    audio,
    'streaming://offline',
    async () => missing,
    callbacks(errors)
  );
  first.play();
  await tick();
  assert.deepEqual(errors, [missing]);
  assert.equal(audio.plays, 0);
  assert.equal(audio.loads, 0);
  first.dispose();
  const retry = createAvailablePlayback(
    audio,
    'streaming://retry',
    async () => ({ available: true }),
    callbacks(errors)
  );
  retry.play();
  await tick();
  assert.equal(audio.plays, 1);
  assert.equal(audio.src, 'streaming://retry');
  retry.dispose();
});
test('a slow old availability response cannot load audio or report an error after a new selection', async () => {
  const response = deferred(),
    audio = new Audio(),
    errors = [];
  const old = createAvailablePlayback(audio, 'old', () => response.promise, callbacks(errors));
  old.play();
  await tick();
  old.dispose();
  const current = createAvailablePlayback(
    audio,
    'new',
    async () => ({ available: true }),
    callbacks(errors)
  );
  current.play();
  await tick();
  response.resolve(missing);
  await tick();
  assert.equal(audio.src, 'new');
  assert.equal(audio.plays, 1);
  assert.deepEqual(errors, []);
  current.dispose();
});
test('pausing during the file check prevents deferred autoplay', async () => {
  const response = deferred(),
    audio = new Audio();
  const session = createAvailablePlayback(audio, 'track', () => response.promise, callbacks([]));
  session.play();
  session.pause();
  response.resolve({ available: true });
  await tick();
  assert.equal(audio.plays, 0);
  session.play();
  assert.equal(audio.plays, 1);
  session.dispose();
});
test('a drive lost during playback gets a folder warning while decoder errors remain decoder errors', async () => {
  for (const offline of [true, false]) {
    const audio = new Audio(),
      errors = [];
    let checks = 0;
    const session = createAvailablePlayback(
      audio,
      'track',
      async () => (++checks === 1 || !offline ? { available: true } : missing),
      callbacks(errors)
    );
    session.play();
    await tick();
    audio.error = { code: 3 };
    audio.dispatchEvent(new Event('error'));
    await tick();
    assert.equal(errors.length, 1);
    assert.equal(offline ? errors[0].reason : errors[0].code, offline ? 'folder-unavailable' : 3);
    session.dispose();
  }
});
test('expanded albums retain their own queue for Skip and Next without replacing Tracks or Playlist', () => {
  const album = [
    { track_id: 'a', audiotrack: 'a.mp3' },
    { track_id: 'b', audiotrack: 'b.flac' }
  ];
  const original = {
    tracks: [{ track_id: 'library' }],
    playlistTracks: [{ track_id: 'playlist' }],
    playbackRequest: 0,
    pause: true
  };
  let state = reducer(original, {
    type: 'select-track',
    track: album[0],
    index: 0,
    list: 'albumTracksActive',
    queue: album,
    play: true
  });
  state = reducer(state, {
    type: 'playback-error',
    request: state.playbackRequest,
    error: missing
  });
  state = reducer(state, { type: 'advance-track', direction: 1, play: true });
  assert.equal(state.active, 'b');
  assert.equal(state.pause, false);
  assert.equal(state.tracks, original.tracks);
  assert.equal(state.playlistTracks, original.playlistTracks);
  assert.deepEqual(getPlaybackQueue(state), album);
});
test('batch notices report unavailable and uncatalogued entries, and browsing keeps catalog entries visible', () => {
  const result = {
    tracks: [],
    unavailableCount: 2,
    missingCatalogCount: 1,
    requestedCount: 3,
    examples: [missing]
  };
  assert.match(availabilityNotice(result, 'Open Playlist').message, /current Playlist was kept/);
  assert.match(
    availabilityNotice(result, 'Expand album', true).message,
    /Catalog tracks remain visible/
  );
  assert.equal(
    availabilityNotice(
      { ...result, tracks: [{}], unavailableCount: 0, missingCatalogCount: 0 },
      'ok'
    ),
    null
  );
});
test('cancelled and failed M3U requests retain the current playlist and display failures', async () => {
  let state = { playlistTracks: [{ track_id: 'keep' }] };
  const dispatch = (action) => {
    state = reducer(state, action);
  };
  globalThis.window = { ipcApi: { invoke: async () => 'action cancelled' } };
  assert.equal(await requestMusicTracks('open-playlist', [], dispatch, 'Open Playlist'), null);
  assert.equal(state.musicNotice, null);
  window.ipcApi.invoke = async () => {
    throw new Error('worker failure');
  };
  assert.equal(await requestMusicTracks('open-playlist', [], dispatch, 'Open Playlist'), null);
  assert.match(state.musicNotice.message, /could not be loaded/);
  assert.equal(state.playlistTracks[0].track_id, 'keep');
});
test('an older batch response cannot erase a newer notice', async () => {
  let state = {};
  const dispatch = (action) => {
    state = reducer(state, action);
  };
  const first = deferred();
  let calls = 0;
  const empty = {
    tracks: [],
    unavailableCount: 1,
    missingCatalogCount: 0,
    requestedCount: 1,
    examples: []
  };
  globalThis.window = {
    ipcApi: { invoke: () => (++calls === 1 ? first.promise : Promise.resolve(empty)) }
  };
  const older = requestMusicTracks('prepare-music-tracks', [], dispatch, 'Old');
  await requestMusicTracks('prepare-music-tracks', [], dispatch, 'New');
  first.resolve({ ...empty, tracks: [{}], unavailableCount: 0 });
  await older;
  assert.equal(state.musicNotice.title, 'New');
});
