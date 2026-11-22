/* global window, document, OfflineAudioContext, setTimeout, MouseEvent */
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GaplessPlayback } from '../src/renderer/src/utility/gaplessPlayback';
import { AudioPlayerProvider } from '../src/renderer/src/AudioPlayerProvider';
import { useAudioPlayer } from '../src/renderer/src/mainAudioContext';
import MediaMenu from '../src/renderer/src/components/MediaMenu';
import Home from '../src/renderer/src/components/Home';
import PlayerScrubber from '../src/renderer/src/components/PlayerScrubber';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const assert = (value, message) => {
  if (!value) throw new Error(message);
};
const sleep = () => new Promise((done) => setTimeout(done, 10));
const wait = async (predicate, message) => {
  for (let i = 0; i < 3000; i++) {
    if (predicate()) return;
    await sleep();
  }
  throw new Error(message);
};
const callbacks = {
  onMetadata() {},
  onSeeking() {},
  onTransition() {},
  onEnded() {},
  onError(error) {
    throw new Error(error.message);
  },
  onFallback(error) {
    throw error;
  }
};
const style = document.createElement('style');
style.textContent =
  window.gaplessCss + '.gapless-fixture .seekbar-outline { width: 300px; grid-column: 1 / -1; }';
document.head.append(style);
let savedPreferences = {};
const preferenceWrites = [];
let pendingPreferenceRead = null;
let failPreferenceSave = false;
window.ipcApi = {
  getRoots: async () => [],
  getPreferences: async () =>
    pendingPreferenceRead ? pendingPreferenceRead : { ...savedPreferences },
  savePreferences: async (patch) => {
    if (failPreferenceSave) return false;
    preferenceWrites.push({ ...patch });
    savedPreferences = { ...savedPreferences, ...patch };
    return true;
  },
  getCovers: async () => [],
  on: () => () => {},
  prepareMusicTracks: async ({ album }) => {
    const tracks = window.gaplessFixtures.playlist
      .map((track, index) => ({
        ...track,
        track: index + 1,
        disc: 1,
        track_id: album === 'album-b' ? 'other-' + track.track_id : track.track_id
      }))
      .reverse();
    return {
      tracks,
      requestedCount: tracks.length,
      unavailableCount: 0,
      missingCatalogCount: 0,
      examples: []
    };
  },
  getCover: async () => null,
  isLiked: async () => ({ like: 0 }),
  checkTrackAvailability: async () => ({ available: true })
};

window.gaplessTests = (async () => {
  const results = [];
  for (const format of ['flac', 'mp3']) {
    const queue = window.gaplessFixtures[format];
    const context = new OfflineAudioContext(1, 50000, 48000);
    context.resume = async () => {};
    context.suspend = async () => {};
    context.close = async () => {};
    const engine = new GaplessPlayback({
      track: queue[0],
      index: 0,
      queue,
      context,
      callbacks,
      tick: () => 0,
      untick() {}
    });
    await engine.ready;
    await wait(() => engine.next?.buffer, `${format} next buffer did not decode`);
    const first = engine.entry.buffer,
      second = engine.next.buffer;
    assert(
      first.length === 24000 && second.length === 24000,
      `${format} decoder retained encoder padding: ${first.length}/${second.length}`
    );
    await engine.play();
    const start = Math.round(engine.entry.start * 48000);
    const join = Math.round(engine.next.start * 48000);
    assert(
      join === start + first.length,
      `${format} sources were not scheduled at adjacent samples`
    );
    const output = await context.startRendering();
    const actual = output.getChannelData(0);
    for (let i = 0; i < first.length; i++)
      assert(
        Math.abs(actual[start + i] - first.getChannelData(0)[i]) < 0.000001,
        `${format} first track changed at sample ${i}`
      );
    for (let i = 0; i < second.length; i++)
      assert(
        Math.abs(actual[join + i] - second.getChannelData(0)[i]) < 0.000001,
        `${format} gap/overlap at second-track sample ${i}`
      );
    engine.dispose();
    results.push(
      `PASS: ${format.toUpperCase()} decoded without extra padding and joined sample-for-sample in Chromium, with no inserted or overlapping samples`
    );
  }

  if (window.gaplessFixtures.real) {
    const queue = window.gaplessFixtures.real;
    const context = new OfflineAudioContext(2, 96000, 48000);
    context.resume = async () => {};
    context.suspend = async () => {};
    context.close = async () => {};
    const engine = new GaplessPlayback({
      track: queue[0],
      index: 0,
      queue,
      context,
      callbacks,
      startTime: queue[0].duration / 1000 - 0.5,
      tick: () => 0,
      untick() {}
    });
    await engine.ready;
    await wait(() => engine.next?.buffer, 'Real high-resolution successor did not decode');
    const first = engine.entry.buffer,
      second = engine.next.buffer;
    const firstOffset = Math.round(engine.entry.offset * context.sampleRate);
    await engine.play();
    const start = Math.round(engine.entry.start * context.sampleRate);
    const join = Math.round(engine.next.start * context.sampleRate);
    assert(
      join === start + first.length - firstOffset,
      'Real high-resolution sources did not meet at the same sample'
    );
    const output = await context.startRendering();
    for (let channel = 0; channel < 2; channel++) {
      const actual = output.getChannelData(channel),
        before = first.getChannelData(channel),
        after = second.getChannelData(channel);
      for (let i = 0; i < first.length - firstOffset; i++)
        assert(
          Math.abs(actual[start + i] - before[firstOffset + i]) < 0.000001,
          'Real track ending changed'
        );
      for (let i = 0; i < Math.min(24000, actual.length - join); i++)
        assert(
          Math.abs(actual[join + i] - after[i]) < 0.000001,
          'Real track join inserted or overlapped audio'
        );
    }
    const retainedMiB =
      ((first.length * first.numberOfChannels + second.length * second.numberOfChannels) * 4) /
      (1024 * 1024);
    engine.dispose();
    results.push(
      `PASS: actual 192 kHz Money → Us and Them files decoded and joined sample-for-sample; ${retainedMiB.toFixed(1)} MiB of decoded audio at ${context.sampleRate} Hz`
    );
  }

  const nativeContext = window.AudioContext;
  const contexts = [];
  window.AudioContext = class extends nativeContext {
    constructor(...args) {
      super(...args);
      // Exercise the real audio clock silently; offline rendering verifies samples.
      const silent = this.createGain();
      silent.gain.value = 0;
      silent.connect(this.destination);
      Object.defineProperty(this, 'destination', { value: silent });
      contexts.push(this);
    }
  };
  let state, dispatch;
  const menuRequests = [];
  function Probe() {
    const context = useAudioPlayer();
    state = context.state;
    dispatch = context.dispatch;
    const [time, setTime] = useState('00:00');
    return (
      <div
        className="gapless-fixture"
        style={{
          display: 'grid',
          width: '760px',
          gridTemplateRows: '2rem 3rem 2rem',
          gridTemplateColumns: 'minmax(0, 1fr) 0'
        }}
      >
        <output>
          {state.title} {time}
        </output>
        {state.home ? (
          <Home />
        ) : (
          <MediaMenu
            handleSortClick={() => {}}
            handleTextSearch={() => {}}
            handlePlaylistFiles={(event) => menuRequests.push(event.currentTarget.id)}
          />
        )}
        <PlayerScrubber cTime={time} setCTime={setTime} />
      </div>
    );
  }
  const element = document.createElement('div');
  document.body.append(element);
  let root = createRoot(element);
  const send = async (action) =>
    act(async () => {
      dispatch(action);
    });
  const settle = async (predicate, message) => {
    for (let i = 0; i < 400; i++) {
      if (predicate()) return;
      await act(async () => {
        await sleep();
      });
    }
    throw new Error(message);
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
    const queue = window.gaplessFixtures.playlist;
    await send({ type: 'set-list-type', listType: 'playlist' });
    await send({ type: 'load-playlist', playlistTracks: queue });
    const toggle = () => element.querySelector('button[aria-label="Gapless playback"]');
    assert(toggle().getAttribute('aria-pressed') === 'false', 'Gapless must default off');
    await act(async () => {
      toggle().click();
    });
    assert(toggle().getAttribute('aria-pressed') === 'true', 'Gapless toggle did not turn on');
    assert(preferenceWrites.at(-1)?.playlistGapless === true, 'Enabling Gapless did not persist');
    for (const id of ['playlist-clear', 'playlist-open', 'playlist-save']) {
      await act(async () => {
        element.querySelector('#' + id).click();
      });
    }
    assert(
      menuRequests.join(',') === 'playlist-clear,playlist-open,playlist-save',
      'Compact Playlist buttons did not invoke their actions'
    );
    const facade = state.audioRef.current;
    await send({
      type: 'select-track',
      track: queue[0],
      index: 0,
      queue,
      list: 'playlistActive',
      play: true
    });
    await settle(
      () => state.delay && facade.transport.kind === 'gapless',
      'Gapless source failed to load'
    );
    const engine = facade.transport;
    await send({ type: 'set-list-type', listType: 'files' });
    await send({ type: 'set-list-type', listType: 'albums' });
    await send({ type: 'set-list-type', listType: 'playlist' });
    assert(
      facade.transport === engine && state.playlistGapless,
      'Browsing lists restarted gapless audio or cleared its setting'
    );
    await settle(
      () => state.active === queue[1].track_id && state.delay,
      'Automatic gapless handoff did not update the selected track'
    );
    assert(
      facade.transport === engine && contexts.length === 1,
      'Automatic handoff recreated the audio engine'
    );
    assert(
      state.newtrack === 1 && state.playbackRequest === 2,
      'Gapless handoff skipped or repeated a track'
    );
    await send({ type: 'pauseplay' });
    const position = facade.currentTime;
    assert(position >= 0 && position < 3, 'Scrubber position is not relative to the new track');
    const scrubber = element.querySelector('.seekbar-outline');
    const seekX = scrubber.getBoundingClientRect().left + scrubber.clientWidth * 0.4;
    await act(async () => {
      scrubber.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: seekX }));
    });
    await act(async () => {
      scrubber.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: seekX }));
    });
    assert(Math.abs(engine.getPosition() - 1.2) < 0.01, 'Gapless seek failed');
    assert(
      element.querySelector('.seekbar').style.width !== '0px',
      `Scrubber did not update after seek: ${state.duration}, ${element.querySelector('output').textContent}, width=${element.querySelector('.seekbar-outline').clientWidth}`
    );
    await act(async () => {
      facade.volume = 0.3;
    });
    assert(
      Math.abs(engine.gain.gain.value - 0.3) < 0.00001,
      'Volume did not control gapless output'
    );
    await act(async () => {
      toggle().click();
    });
    await settle(
      () => state.delay && facade.transport === facade.nativeAudio,
      'Turning gapless off did not restore ordinary playback'
    );
    assert(engine.disposed, 'Turning gapless off left scheduled audio alive');
    assert(
      Math.abs(facade.currentTime - 1.2) < 0.02 && state.pause,
      'Toggling changed position or resumed paused audio'
    );
    await act(async () => {
      toggle().click();
    });
    await settle(
      () => state.delay && facade.transport.kind === 'gapless',
      'Turning gapless back on failed'
    );
    await send({
      type: 'select-track',
      track: queue[0],
      index: 0,
      queue,
      list: 'albumTracksActive',
      albumPath: 'Test Album',
      play: false
    });
    await settle(
      () => state.delay && facade.transport === facade.nativeAudio,
      'Albums unexpectedly used gapless playback'
    );
    assert(state.playlistGapless, 'Switching source erased the Playlist option');
    await send({
      type: 'select-track',
      track: queue[1],
      index: 1,
      queue,
      list: 'playlistActive',
      resume: true,
      play: false
    });
    await settle(
      () => state.delay && facade.transport.kind === 'gapless',
      'Returning to Playlist did not restore gapless playback'
    );
    assert(
      Math.abs(facade.currentTime - 1.2) < 0.02 && state.pause,
      'Returning from another list lost the Playlist position or resumed unexpectedly'
    );
    await send({ type: 'reset', pause: true });
    results.push(
      'PASS: real Playlist menu, automatic handoff, relative scrubber, seek/volume/pause, toggle at current position, and Albums isolation'
    );

    await send({ type: 'set-page', home: true, player: false, update: false, library: false });
    await send({
      type: 'set-covers',
      covers: [
        { id: 'a', fullpath: 'album-a', foldername: 'First album', img: null },
        { id: 'b', fullpath: 'album-b', foldername: 'Second album', img: null }
      ]
    });
    const coversToggle = () =>
      element.querySelector('.album-cover-tools button[aria-label="Gapless playback"]');
    await settle(
      () => coversToggle() && element.querySelectorAll('.play-stop-button').length === 2,
      'Covers controls did not render'
    );
    assert(
      coversToggle().getAttribute('aria-pressed') === 'true',
      'Covers did not reflect existing Gapless setting'
    );
    const coverPlay = (album) =>
      [...element.querySelectorAll('.play-stop-button')].find((button) => button.id === album);
    await act(async () => {
      coverPlay('album-a').click();
    });
    await settle(
      () =>
        state.active === queue[0].track_id && state.delay && facade.transport.kind === 'gapless',
      'Album launched from Covers did not use Gapless or track order'
    );
    const firstAlbumEngine = facade.transport;
    await act(async () => {
      coverPlay('album-b').click();
    });
    await settle(
      () => state.active === 'other-' + queue[0].track_id && state.delay,
      'Second Covers album did not start'
    );
    assert(
      state.playlistGapless && facade.transport.kind === 'gapless' && firstAlbumEngine.disposed,
      'Loading another album reset Gapless or retained old audio'
    );
    await send({ type: 'reset', pause: true });
    await act(async () => {
      coversToggle().click();
    });
    assert(
      !state.playlistGapless && savedPreferences.playlistGapless === false,
      'Turning off Gapless from Covers did not persist'
    );
    await act(async () => {
      coversToggle().click();
    });
    assert(savedPreferences.playlistGapless === true, 'Covers did not save the enabled preference');

    await act(async () => {
      root.unmount();
    });
    root = createRoot(element);
    await act(async () => {
      root.render(
        <AudioPlayerProvider>
          <Probe />
        </AudioPlayerProvider>
      );
    });
    await settle(
      () => state.playlistGapless === true,
      'Remount did not restore saved Gapless preference'
    );
    await send({ type: 'set-list-type', listType: 'playlist' });
    assert(
      toggle().getAttribute('aria-pressed') === 'true',
      'Playlist did not reflect the preference saved from Covers'
    );
    const writesBeforeLoad = preferenceWrites.length;
    await send({ type: 'playlist-clear', playlistTracks: [], pause: true });
    assert(
      state.playlistGapless && preferenceWrites.length === writesBeforeLoad,
      'Clearing Playlist reset or rewrote Gapless'
    );

    await act(async () => {
      root.unmount();
    });
    let resolveOldRead;
    pendingPreferenceRead = new Promise((resolve) => {
      resolveOldRead = resolve;
    });
    root = createRoot(element);
    await act(async () => {
      root.render(
        <AudioPlayerProvider>
          <Probe />
        </AudioPlayerProvider>
      );
    });
    await send({ type: 'set-list-type', listType: 'playlist' });
    await act(async () => {
      toggle().click();
    });
    await act(async () => {
      resolveOldRead({ playlistGapless: false });
    });
    pendingPreferenceRead = null;
    assert(state.playlistGapless, 'A late preference read overwrote the user toggle');
    failPreferenceSave = true;
    await act(async () => {
      toggle().click();
    });
    assert(
      !state.playlistGapless && state.musicNotice?.title === 'Gapless setting',
      'Failed save did not preserve the session setting and explain persistence failure'
    );
    failPreferenceSave = false;
    await act(async () => {
      toggle().click();
    });
    results.push(
      'PASS: shared Covers/Playlist toggle, ordered Covers album launches, sticky setting across album changes and restarts, late reads, and failed saves'
    );

    window.gaplessPreview = async (theme, mini, covers = false) => {
      await send({
        type: 'set-page',
        home: covers,
        player: !covers,
        update: false,
        library: !covers
      });
      await send({ type: 'set-list-type', listType: 'playlist' });
      await send({ type: 'set-main-theme', mainTheme: theme });
      await send({ type: 'mini-mode-playlist', miniModePlaylist: mini, library: true });
      element.querySelector('.gapless-fixture').style.width = mini ? '320px' : '760px';
      const button = covers ? coversToggle() : toggle();
      const dialogs = element.querySelector(covers ? '.album-cover-tools' : '.playlist-dialogs');
      const bounds = dialogs.getBoundingClientRect(),
        hit = button.getBoundingClientRect();
      assert(
        hit.width > 0 && hit.left >= bounds.left && hit.right <= bounds.right,
        'Gapless toggle extends outside the Playlist menu'
      );
      if (!covers) {
        const buttons = [...element.querySelectorAll('.playlist-actions button')];
        const rectangles = buttons.map((button) => button.getBoundingClientRect());
        assert(
          rectangles.every((rect) => rect.width < 60 && rect.height < 34),
          'Playlist file buttons are not compact'
        );
        assert(
          rectangles[1].left - rectangles[0].right <= 5 &&
            rectangles[2].left - rectangles[1].right <= 5,
          'Playlist file buttons are not grouped closely'
        );
        if (!mini)
          assert(
            rectangles[2].right < element.querySelector('.tabs').getBoundingClientRect().left,
            'Playlist actions push into the tabs'
          );
      }
    };
    window.disposeGaplessPreview = async () => {
      await act(async () => {
        root.unmount();
      });
      element.remove();
      window.AudioContext = nativeContext;
    };
  } catch (error) {
    await act(async () => {
      root.unmount();
    });
    element.remove();
    window.AudioContext = nativeContext;
    throw error;
  }
  return results;
})();
