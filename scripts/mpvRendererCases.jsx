/* global window, document, setTimeout, Event */
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AudioPlayerProvider } from '../src/renderer/src/AudioPlayerProvider';
import { useAudioPlayer } from '../src/renderer/src/mainAudioContext';
import PlaybackPreferences from '../src/renderer/src/components/PlaybackPreferences';
import Item from '../src/renderer/src/components/Item';
import AlbumTrackList from '../src/renderer/src/components/AlbumTrackList';
import PlayerScrubber from '../src/renderer/src/components/PlayerScrubber';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const assert = (value, message) => {
  if (!value) throw Error(message);
};
let state, dispatch;
export function Probe() {
  const c = useAudioPlayer();
  state = c.state;
  dispatch = c.dispatch;
  const [time, setTime] = useState('00:00');
  return (
    <div className={state.mainTheme}>
      <PlaybackPreferences />
      <div style={{ width: 300 }}>
        <PlayerScrubber cTime={time} setCTime={setTime} />
      </div>
      <output>{time}</output>
      <div className="playlist-list" id="problem-playlist">
        {state.playlistTracks.map((track, index) => (
          <Item
            key={track.track_id}
            type="playlist"
            track={track}
            audiofile={track.audiotrack}
            title={track.title}
            artist="Test artist"
            album="Test album"
            id={track.track_id}
            divId={track.track_id + '--playlist'}
            data-val={index}
            href={track.track_id}
          />
        ))}
      </div>
      <div className="files-list" id="problem-tracks">
        {state.playlistTracks.map((track, index) => (
          <Item
            key={track.track_id}
            type="files"
            track={track}
            audiofile={track.audiotrack}
            title={track.title}
            artist="Test artist"
            album="Test album"
            id={track.track_id}
            divId={track.track_id + '--files'}
            data-val={index}
            href={track.track_id}
          />
        ))}
      </div>
      <ul className="albumtracks">
        <AlbumTrackList tracks={state.playlistTracks} albumPath="fixture-album" />
      </ul>
    </div>
  );
}
window.mpvTests = (async () => {
  const element = document.createElement('div');
  document.body.append(element);
  const css = document.createElement('style');
  css.textContent = '.seekbar-outline{width:300px;height:20px}.seekbar{height:20px}';
  document.head.append(css);
  let root = createRoot(element);
  const mount = () =>
    act(async () =>
      root.render(
        <AudioPlayerProvider>
          <Probe />
        </AudioPlayerProvider>
      )
    );
  const send = (action) => act(async () => dispatch(action));
  const wait = async (predicate, message) => {
    for (let i = 0; i < 1000; i++) {
      if (predicate()) return;
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
    }
    throw Error(message);
  };
  const results = [],
    queue = window.mpvFixtures;
  try {
    await mount();
    await wait(() => !element.querySelector('option[value=mpv]').disabled, 'mpv availability');
    await act(async () => {
      const select = element.querySelector('select');
      select.value = 'mpv';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    assert(state.playbackBackend === 'mpv', 'settings engine selection failed');
    await send({ type: 'toggle-playlist-gapless' });
    await send({ type: 'load-playlist', playlistTracks: queue });
    await send({
      type: 'select-track',
      track: queue[0],
      index: 0,
      queue,
      list: 'playlistActive',
      play: true
    });
    const facade = state.audioRef.current,
      engine = facade.transport;
    await wait(() => state.delay, 'mpv metadata did not reach provider');
    assert(engine.kind === 'mpv', 'wrong engine');
    await send({ type: 'set-list-type', listType: 'albums' });
    await send({ type: 'set-list-type', listType: 'playlist' });
    assert(facade.transport === engine, 'browsing restarted engine');
    await wait(
      () => state.active === queue[1].track_id && state.delay,
      'native handoff did not reach reducer'
    );
    assert(
      facade.transport === engine && state.newtrack === 1,
      'native handoff recreated transport'
    );
    await send({ type: 'pauseplay' });
    await act(async () => {
      facade.currentTime = 1.5;
      facade.volume = 0.123;
    });
    await wait(() => !engine.pendingSeek, 'seek did not complete');
    assert(Math.abs(facade.currentTime - 1.5) < 0.1, 'seek position incorrect');
    assert(Math.abs(state.volume - 0.123) < 0.0005, 'volume did not reach provider');
    await wait(
      () => element.querySelector('output').textContent === '00:01',
      'scrubber time did not update'
    );
    results.push(
      'PASS Settings selector, preference save, metadata, native handoff, list browsing, seek/scrubber and volume through real IPC/mpv'
    );
    await send({
      type: 'select-track',
      track: queue[0],
      index: 0,
      queue,
      list: 'albumTracksActive',
      albumPath: 'album',
      play: true
    });
    await wait(() => state.activeList === 'albumTracksActive' && state.delay, 'album source load');
    await wait(() => state.pause && facade.ended, 'album single-track stop');
    assert(state.active === queue[0].track_id, 'album unexpectedly advanced');
    await send({ type: 'pauseplay' });
    await wait(() => !facade.ended && facade.currentTime > 0.1, 'album replay failed');
    await send({ type: 'pauseplay' });
    await send({
      type: 'select-track',
      track: queue[1],
      index: 1,
      queue,
      list: 'playlistActive',
      resume: true,
      play: false
    });
    await wait(() => state.delay && !facade.transport.pendingSeek, 'remembered playlist load');
    assert(Math.abs(facade.currentTime - 1.5) < 0.2, 'playlist timeline not restored');
    results.push('PASS expanded-album stop and replay; previous Playlist timeline restored');
    const retainedEngine = facade.transport;
    await send({ type: 'remove-track', id: queue[0].track_id });
    await wait(() => retainedEngine.index === 0, 'native playlist index did not rebase');
    assert(
      facade.transport === retainedEngine && state.pause && state.active === queue[1].track_id,
      'removing a preceding row advanced or restarted the selected track'
    );
    results.push(
      'PASS removing a preceding Playlist row retains selection, position, pause and transport'
    );
    await send({ type: 'set-playback-backend', backend: 'builtin' });
    assert(
      facade.transport.kind !== 'mpv' && engine.disposed,
      'switching to built-in did not release mpv'
    );
    assert(Math.abs(state.playbackStartTime - 1.5) < 0.2, 'backend switch lost position');
    await send({ type: 'set-playback-backend', backend: 'mpv' });
    await wait(() => state.delay && facade.transport.kind === 'mpv', 'switch back to mpv');
    await act(async () => root.unmount());
    root = createRoot(element);
    await mount();
    await wait(() => state.playbackBackend === 'mpv', 'mpv preference did not restore');
    assert(!state.playbackTrack && state.pause, 'restoring preference autoplayed');
    results.push(
      'PASS backend switching preserves position and paused state; restart restores preference without autoplay'
    );
    await send({ type: 'load-playlist', playlistTracks: queue });
    await send({
      type: 'select-track',
      track: queue[2],
      index: 2,
      queue,
      list: 'playlistActive',
      play: true
    });
    await wait(() => state.playbackError, 'corrupt track did not report native decoder failure');
    assert(
      element.querySelectorAll('.track-problem-badge').length === 3,
      'failed track is not marked in Playlist, Tracks and expanded Albums'
    );
    await send({
      type: 'select-track',
      track: queue[0],
      index: 0,
      queue,
      list: 'playlistActive',
      play: false
    });
    await wait(() => state.delay && !state.playbackError, 'healthy track did not load');
    await send({ type: 'set-list-type', listType: 'albums' });
    await send({ type: 'set-list-type', listType: 'playlist' });
    assert(
      element.querySelectorAll('.track-problem-badge').length === 3,
      'browsing or selecting another track erased known failures'
    );
    assert(
      element.querySelector('.track-problem-badge').title.includes('retry'),
      'failure details do not explain retry'
    );
    await window.mpvTestApi.capture();
    await window.mpvTestApi.repair();
    await act(async () => {
      element.querySelector('#problem-playlist [href="bad-track"]').click();
    });
    await wait(
      () => state.active === 'bad-track' && state.delay && !state.playbackError,
      'clicking repaired track did not retry'
    );
    assert(
      element.querySelectorAll('.track-problem-badge').length === 0,
      'successful retry did not clear failure markers'
    );
    results.push(
      'PASS actual decoder failure marked across all track lists, retained while browsing, and cleared after repairing/retrying the file'
    );
    return results;
  } finally {
    await act(async () => root.unmount());
  }
})();
