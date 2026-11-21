/* global window, document, HTMLMediaElement, URL, Blob, setTimeout */
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AudioPlayerProvider } from '../src/renderer/src/AudioPlayerProvider';
import { useAudioPlayer } from '../src/renderer/src/mainAudioContext';
import PlayerScrubber from '../src/renderer/src/components/PlayerScrubber';
import SelectionPlayButton from '../src/renderer/src/components/SelectionPlayButton';

const assert = (value, message) => {
  if (!value) throw new Error(message);
};
const tracks = ['one', 'two'].map((id) => ({ track_id: id, audiotrack: id + '.wav', title: id }));
const near = (value, expected) => Math.abs(value - expected) < 0.05;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

// Real Chromium metadata and seeking, with a generated silent WAV and no real
// catalog/drives. Recording play() keeps positions exact and needs no sound device.
function wav() {
  const bytes = new Uint8Array(44 + 8000 * 8 * 2);
  const view = new DataView(bytes.buffer);
  const word = (at, text) =>
    [...text].forEach((c, i) => {
      bytes[at + i] = c.charCodeAt(0);
    });
  word(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  word(8, 'WAVE');
  word(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  word(36, 'data');
  view.setUint32(40, bytes.length - 44, true);
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
}

export async function testPlaybackPositions() {
  const nativeAudio = window.Audio;
  const nativeApi = window.ipcApi;
  const url = wav();
  const source = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
  let audio,
    state,
    dispatch,
    pending = null,
    missing = false;
  const plays = [];
  window.Audio = function () {
    const element = new nativeAudio();
    audio = element;
    Object.defineProperty(element, 'src', {
      get() {
        return source.get.call(this);
      },
      set(value) {
        source.set.call(this, value ? url : '');
      }
    });
    element.play = () => {
      plays.push(element.currentTime);
      return Promise.resolve();
    };
    return element;
  };
  window.ipcApi = {
    getRoots: async () => [],
    getCover: async () => null,
    isLiked: async () => ({ like: 0 }),
    checkTrackAvailability: async () =>
      pending
        ? pending.promise
        : missing
          ? { available: false, message: 'Test drive unavailable' }
          : { available: true }
  };
  function Probe() {
    const context = useAudioPlayer();
    state = context.state;
    dispatch = context.dispatch;
    const [time, setTime] = useState('00:00');
    return (
      <>
        <output data-time>{time}</output>
        <PlayerScrubber cTime={time} setCTime={setTime} />
        <SelectionPlayButton
          list="tracklistActive"
          track={tracks[0]}
          index={0}
          queue={tracks}
          title="one"
        />
      </>
    );
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const send = (action) =>
    act(async () => {
      dispatch(action);
    });
  const select = (index, list) =>
    send({ type: 'select-track', track: tracks[index], index, queue: tracks, list, play: true });
  const wait = async (predicate, message) => {
    for (let i = 0; i < 200; i++) {
      if (predicate()) return;
      await act(async () => {
        await new Promise((done) => setTimeout(done, 10));
      });
    }
    throw new Error(message);
  };
  const seek = async (position) => {
    await act(async () => {
      audio.currentTime = position;
    });
    await wait(() => !audio.seeking, 'Chromium seek did not finish');
  };
  try {
    await act(async () => {
      root.render(
        <React.StrictMode>
          <AudioPlayerProvider>
            <Probe />
          </AudioPlayerProvider>
        </React.StrictMode>
      );
    });
    await select(0, 'tracklistActive');
    await wait(() => state.delay, 'First track did not load');
    await seek(1.25);
    await select(1, 'playlistActive');
    await wait(() => state.delay, 'Playlist did not load');
    assert(
      near(state.listSelections.tracklistActive.position, 1.25),
      'Provider failed to capture outgoing audio time'
    );
    await seek(2.5);
    pending = deferred();
    const drive = pending;
    await act(async () => {
      container.querySelector('.selection-play').click();
    });
    assert(
      state.playbackStartTime === 1.25 && !state.delay,
      'Delayed return lost its saved position'
    );
    const playCount = plays.length;
    await send({ type: 'pauseplay' });
    pending = null;
    await act(async () => {
      drive.resolve({ available: true });
    });
    await wait(() => state.delay && !audio.seeking, 'Delayed restoration did not finish');
    assert(near(audio.currentTime, 1.25), 'Real audio did not restore the saved position');
    assert(plays.length === playCount, 'Pausing while loading did not suppress autoplay');
    assert(
      container.querySelector('[data-time]').textContent === '00:01',
      'Scrubber elapsed time did not reflect restored seek'
    );
    assert(
      parseFloat(container.querySelector('.seekbar').style.width) > 0,
      'Scrubber progress did not reflect restored seek'
    );
    await send({ type: 'pauseplay' });
    assert(near(plays.at(-1), 1.25), 'Playback started at zero instead of the restored position');
    await select(1, 'playlistActive');
    await wait(() => state.delay && !audio.seeking, 'Playlist return did not load');
    assert(near(audio.currentTime, 2.5), 'Playlist did not retain its independent position');
    assert(near(plays.at(-1), 2.5), 'Playlist began playing before its seek completed');
    const loadedSource = audio.src;
    const previousPlays = plays.length;
    await send({ type: 'set-volume', volume: 0.5 });
    assert(
      audio.src === loadedSource && plays.length === previousPlays,
      'Unrelated state restarted playback'
    );
    missing = true;
    await select(0, 'tracklistActive');
    await wait(() => state.playbackError, 'Missing track did not report failure');
    assert(state.listSelections.tracklistActive.position === 1.25, 'Missing track erased position');
    missing = false;
    await send({ type: 'retry-track' });
    await wait(() => state.delay && !audio.seeking, 'Retry failed to restore');
    assert(near(audio.currentTime, 1.25), 'Retry lost saved position');
    await select(1, 'playlistActive');
    await wait(() => state.delay && !audio.seeking, 'Playlist reload failed');
    pending = deferred();
    const stale = pending;
    await select(0, 'tracklistActive');
    pending = null;
    await select(0, 'playlistActive');
    await wait(() => state.delay && !audio.seeking, 'New selection did not load');
    await act(async () => {
      stale.resolve({ available: true });
    });
    assert(
      state.activeList === 'playlistActive' && near(audio.currentTime, 0),
      'Late drive response changed the newer selection'
    );
    return [
      'PASS: real provider captures per-list positions; Chromium restores seeks and scrubber time; delayed pause, unavailable Retry, and stale loads preserve correct playback'
    ];
  } finally {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    window.Audio = nativeAudio;
    window.ipcApi = nativeApi;
    URL.revokeObjectURL(url);
  }
}
