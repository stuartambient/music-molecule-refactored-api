/* global EventTarget, Event, setImmediate */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GaplessPlayback, loadGaplessBuffer } from '../src/renderer/src/utility/gaplessPlayback.js';
import { PlaybackAudio } from '../src/renderer/src/utility/playbackAudio.js';
import reducer from '../src/renderer/src/audioPlayerReducer.js';

const tracks = ['a', 'b', 'c'].map((id) => ({ track_id: id, audiotrack: id + '.flac' }));
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const buffer = (duration = 1) => ({ duration, length: duration * 48000, numberOfChannels: 2 });
class Context {
  currentTime = 0;
  sources = [];
  closed = false;
  state = 'running';
  destination = {};
  createGain() {
    return { gain: { value: 1 }, connect() {}, disconnect() {} };
  }
  createBufferSource() {
    const source = {
      connect() {},
      disconnect() {},
      start(when, offset) {
        this.when = when;
        this.offset = offset;
      },
      stop() {
        this.stopped = true;
      }
    };
    this.sources.push(source);
    return source;
  }
  async resume() {
    this.state = 'running';
  }
  async suspend() {
    this.state = 'suspended';
  }
  async close() {
    this.closed = true;
  }
}
async function fixture(options = {}) {
  const context = new Context(),
    transitions = [],
    ended = [],
    failures = [],
    fallbacks = [];
  let cleared = false;
  const callbacks = {
    onMetadata() {},
    onTransition(...args) {
      transitions.push(args);
    },
    onEnded() {
      ended.push(true);
    },
    onError(error) {
      failures.push(error);
    },
    onFallback(error) {
      fallbacks.push(error);
    }
  };
  const session = new GaplessPlayback({
    track: tracks[0],
    index: 0,
    queue: tracks,
    startTime: 0,
    context,
    load: async () => buffer(),
    callbacks,
    tick: () => 1,
    untick: () => {
      cleared = true;
    },
    ...options
  });
  await session.ready;
  await tick();
  return {
    context,
    session,
    callbacks,
    transitions,
    ended,
    failures,
    fallbacks,
    cleared: () => cleared
  };
}

test('high-resolution file sizes are accepted and limit failures explain the actual reason', async () => {
  const savedWindow = globalThis.window,
    savedFetch = globalThis.fetch;
  let size = 311345163,
    decoded = buffer();
  globalThis.window = { ipcApi: { checkTrackAvailability: async () => ({ available: true }) } };
  globalThis.fetch = async () => ({
    ok: true,
    headers: { get: () => String(size) },
    arrayBuffer: async () => new ArrayBuffer(1)
  });
  const context = { decodeAudioData: async () => decoded };
  const signal = new globalThis.AbortController().signal;
  try {
    assert.equal(await loadGaplessBuffer(context, tracks[0], signal), decoded);
    size = 512 * 1024 * 1024 + 1;
    await assert.rejects(
      loadGaplessBuffer(context, tracks[0], signal),
      /file exceeds the 512 MiB limit/
    );
    size = 100;
    decoded = { length: (512 * 1024 * 1024) / 8 + 1, numberOfChannels: 2 };
    await assert.rejects(
      loadGaplessBuffer(context, tracks[0], signal),
      /decoded track exceeds the 512 MiB/
    );
    let state = {
      tracks,
      playlistTracks: tracks,
      playbackRequest: 0,
      pause: true,
      playlistGapless: true
    };
    state = reducer(state, {
      type: 'select-track',
      track: tracks[0],
      list: 'playlistActive',
      index: 0
    });
    state = reducer(state, {
      type: 'gapless-fallback',
      request: state.playbackRequest,
      position: 0,
      reason: 'The decoded track exceeds the 512 MiB gapless audio buffer limit.'
    });
    assert.match(state.musicNotice.message, /512 MiB/);
  } finally {
    globalThis.fetch = savedFetch;
    if (savedWindow === undefined) delete globalThis.window;
    else globalThis.window = savedWindow;
  }
});

test('upcoming track is scheduled at the exact audio-clock boundary before ended fires', async () => {
  const { context, session, transitions, callbacks } = await fixture();
  await session.play();
  const [first, second] = context.sources;
  assert.equal(second.when, first.when + first.buffer.duration - first.offset);
  assert.equal(transitions.length, 0);
  context.currentTime = second.when + 0.003;
  first.onended();
  assert.equal(session.entry.track.track_id, 'b');
  assert.equal(transitions.length, 1);
  assert(Math.abs(session.currentTime - 0.003) < 0.000001);
  assert(session.adopt(tracks[1], 1, transitions[0][2], callbacks));
  await tick();
  assert.equal(context.sources[2].when, second.when + second.buffer.duration);
  session.dispose();
});

test('pause and seeking cancel scheduled successors and resume at the correct offset', async () => {
  const { context, session } = await fixture();
  await session.play();
  const first = context.sources[0],
    second = context.sources[1];
  context.currentTime = first.when + 0.4;
  session.pause();
  assert(first.stopped && second.stopped);
  assert.equal(session.currentTime, 0.4);
  await session.play();
  assert.equal(context.sources[2].offset, 0.4);
  session.currentTime = 0.7;
  await tick();
  assert(context.sources[2].stopped && context.sources[3].stopped);
  assert.equal(context.sources[4].offset, 0.7);
  assert.equal(context.sources[5].when, context.sources[4].when + 0.3);
  session.dispose();
});

test('reordering or removing upcoming entries cancels the obsolete source and stale decode', async () => {
  const late = deferred();
  const { context, session } = await fixture({
    load: async (_context, track) => (track.track_id === 'b' ? late.promise : buffer())
  });
  await session.play();
  session.updateQueue([tracks[0], tracks[2]]);
  await tick();
  const next = context.sources[1];
  assert.equal(session.next.track.track_id, 'c');
  late.resolve(buffer());
  await tick();
  assert.equal(session.next.track.track_id, 'c');
  session.updateQueue([tracks[0]]);
  assert(next.stopped);
  assert.equal(session.next, null);
  session.dispose();
});

test('a sleeping drive can finish buffering later without reloading or autoplay after Pause', async () => {
  const late = deferred();
  const { context, session, callbacks, transitions } = await fixture({
    load: async (_context, track) => (track.track_id === 'b' ? late.promise : buffer())
  });
  await session.play();
  context.currentTime = context.sources[0].when + 1;
  context.sources[0].onended();
  assert.equal(session.waiting, true);
  session.pause();
  late.resolve(buffer());
  await tick();
  assert.equal(context.sources.length, 1);
  await session.play();
  assert.equal(transitions.length, 1);
  assert(session.adopt(tracks[1], 1, transitions[0][2], callbacks));
  session.dispose();
});

test('missing upcoming tracks do not interrupt the current track, and failures stay recoverable', async () => {
  const { context, session, ended, failures } = await fixture({
    load: async (_context, track) => {
      if (track.track_id === 'b')
        throw Object.assign(new Error('Offline'), {
          availability: { reason: 'folder-unavailable' }
        });
      return buffer();
    }
  });
  assert.equal(failures.length, 0);
  await session.play();
  assert.equal(ended.length, 0);
  context.currentTime = context.sources[0].when + 1;
  context.sources[0].onended();
  assert.equal(ended.length, 1);
  assert.equal(session.getPosition(), 0);
  session.dispose();
});

test('disposing during decode prevents late playback and closes the context and timer', async () => {
  const late = deferred();
  const { session, context, cleared } = await fixture({
    load: async (_context, track) => (track.track_id === 'b' ? late.promise : buffer())
  });
  await session.play();
  session.dispose();
  late.resolve(buffer());
  await tick();
  assert.equal(context.closed, true);
  assert(cleared());
  assert.equal(context.sources.length, 1);
  assert(context.sources[0].stopped);
  assert.equal(session.entry.buffer, null);
});

test('a late upcoming failure while paused at the boundary cannot restart playback', async () => {
  const late = deferred();
  const { context, session, ended } = await fixture({
    load: async (_context, track) => (track.track_id === 'b' ? late.promise : buffer())
  });
  await session.play();
  context.currentTime = context.sources[0].when + 1;
  context.sources[0].onended();
  session.pause();
  late.reject(new Error('Drive disappeared'));
  await tick();
  assert.equal(ended.length, 0);
  assert.equal(session.paused, true);
  await session.play();
  assert.equal(ended.length, 1);
  session.dispose();
});

test('unavailable current files report an error; unsupported decoding falls back without auto-starting', async () => {
  for (const unavailable of [false, true]) {
    const failure = Object.assign(
      new Error('Cannot decode'),
      unavailable ? { availability: { reason: 'file-missing', message: 'Missing' } } : {}
    );
    const { session, context, failures, fallbacks } = await fixture({
      load: async () => {
        throw failure;
      }
    });
    assert.equal(unavailable ? failures.length : fallbacks.length, 1);
    assert.equal(context.sources.length, 0);
    assert.equal(session.getPosition(), undefined);
    session.dispose();
  }
});

test('completed Playlist playback pauses and can replay the final track from zero', async () => {
  const { session, context, ended } = await fixture({ queue: [tracks[0]] });
  await session.play();
  context.currentTime = context.sources[0].when + 1;
  context.sources[0].onended();
  assert.equal(ended.length, 1);
  assert.equal(session.paused, true);
  assert.equal(session.getPosition(), 0);
  await session.play();
  assert.equal(context.sources[1].offset, 0);
  session.dispose();
});

test('normal and gapless playback share stable scrubber events and volume controls', () => {
  class Audio extends EventTarget {
    volume = 0.4;
    currentTime = 12;
    duration = 30;
    pause() {}
  }
  const native = new Audio(),
    other = new Audio(),
    audio = new PlaybackAudio(native);
  let updates = 0;
  audio.addEventListener('timeupdate', () => updates++);
  native.dispatchEvent(new Event('timeupdate'));
  audio.useTransport(other);
  other.currentTime = 4;
  other.dispatchEvent(new Event('timeupdate'));
  native.dispatchEvent(new Event('timeupdate'));
  assert.equal(updates, 2);
  assert.equal(audio.currentTime, 4);
  audio.volume = 0.7;
  audio.useTransport(null);
  assert.equal(audio.volume, 0.7);
});

test('toggle and handoff preserve source ownership and reject stale transitions', () => {
  let state = { tracks, playlistTracks: tracks, playbackRequest: 0, pause: true };
  state = reducer(state, {
    type: 'select-track',
    track: tracks[0],
    list: 'playlistActive',
    index: 0,
    play: true
  });
  const first = state.playbackRequest;
  state = reducer(state, {
    type: 'toggle-playlist-gapless',
    playbackSnapshot: { request: first, position: 12 }
  });
  assert.equal(state.playlistGapless, true);
  assert.equal(state.playbackStartTime, 12);
  assert.equal(state.pause, false);
  const request = state.playbackRequest;
  state = reducer(state, {
    type: 'gapless-transition',
    request,
    trackId: 'b',
    trackPath: tracks[1].audiotrack,
    index: 1,
    token: 'handoff'
  });
  assert.equal(state.active, 'b');
  assert.equal(state.gaplessTransition, 'handoff');
  assert.equal(state.playbackRequest, request + 1);
  assert.equal(
    reducer(state, { type: 'gapless-transition', request, trackId: 'c', index: 2, token: 'old' }),
    state
  );
  const normal = reducer(state, {
    type: 'select-track',
    track: tracks[2],
    index: 2,
    list: 'tracklistActive'
  });
  assert.equal(normal.gaplessTransition, null);
  assert.equal(
    reducer(normal, {
      type: 'gapless-transition',
      request: normal.playbackRequest,
      trackId: 'a',
      index: 0,
      token: 'bad'
    }),
    normal
  );
});
