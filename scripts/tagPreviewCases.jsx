/* global window, document, Event, HTMLInputElement, EventTarget */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AudioProvider } from '../src/renderer/src/components/table/AudioProvider.jsx';
import { useAudio } from '../src/renderer/src/components/table/audioContext.js';
import TableAudioControls from '../src/renderer/src/components/table/TableAudioControls.jsx';
import PlayButtonRenderer from '../src/renderer/src/components/table/PlayButtonRenderer.jsx';
import { EditorThemeContext } from '../src/renderer/src/editorThemeContext.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const assert = (value, message) => {
  if (!value) throw new Error(message);
};
const nativeAudio = window.Audio;
let fake, context;
class PreviewAudio extends EventTarget {
  constructor() {
    super();
    fake = this;
    this.paused = true;
    this.ended = false;
    this.duration = NaN;
    this.currentTime = 0;
    this.volume = 1;
    this.error = null;
    this.loads = 0;
    this.sources = 0;
    this.listeners = new Map();
  }
  addEventListener(event, listener) {
    super.addEventListener(event, listener);
    this.listeners.set(listener, event);
  }
  removeEventListener(event, listener) {
    super.removeEventListener(event, listener);
    this.listeners.delete(listener);
  }
  set src(value) {
    this.source = value;
    this.sources++;
    this.load();
  }
  get src() {
    return this.source || '';
  }
  load() {
    this.loads++;
    this.duration = NaN;
    this.currentTime = 0;
    this.error = null;
    this.ended = false;
    this.dispatchEvent(new Event('emptied'));
  }
  removeAttribute() {
    this.source = '';
  }
  play() {
    this.paused = false;
    this.ended = false;
    this.dispatchEvent(new Event('play'));
    const result = this.nextPlay || Promise.resolve();
    this.nextPlay = null;
    return result;
  }
  pause() {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
}
window.Audio = PreviewAudio;
const tracks = [
  'I:/Music/Test Album/01 - Quiet Morning.flac',
  'I:/Music/Test Album/02 - Long Track.mp3'
];
function Probe() {
  context = useAudio();
  return null;
}
export function PreviewFixture() {
  return (
    <EditorThemeContext.Provider value={{ theme: 'dark' }}>
      <AudioProvider>
        <Probe />
        <h2>Tag editor · Audio preview</h2>
        <div style={{ height: 36, background: 'var(--ui-raised)', margin: '18px 0' }}>
          <TableAudioControls />
        </div>
        <div className="preview-fixture-rows">
          {tracks.map((track) => (
            <div key={track}>
              <PlayButtonRenderer node={{ data: { audiotrack: track } }} />{' '}
              <span>{track.split('/').at(-1)}</span>
            </div>
          ))}
        </div>
      </AudioProvider>
    </EditorThemeContext.Provider>
  );
}
const host = document.createElement('div');
host.style.cssText = 'max-width:900px;margin:80px auto;color:var(--ui-text);';
document.body.append(host);
const style = document.createElement('style');
style.textContent =
  '.preview-fixture-rows > div {display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid var(--ui-border);font-size:14px}';
document.head.append(style);
const root = createRoot(host);
const button = (name) => document.querySelector(`button[aria-label="${name}"]`);
const click = async (element) => {
  assert(element, 'Missing control');
  await act(async () => {
    element.click();
  });
};
const change = async (element, value) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
      element,
      String(value)
    );
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const emit = async (event) => {
  await act(async () => {
    fake.dispatchEvent(new Event(event));
  });
};
window.previewTests = (async () => {
  const results = [];
  await act(async () => {
    root.render(<PreviewFixture />);
  });
  const seek = document.querySelector('[aria-label="Preview position"]');
  assert(seek.disabled && button('Play preview').disabled, 'Idle preview controls enabled');
  await click(button('Play track preview'));
  assert(context.currentTrack === tracks[0] && context.isPlaying, 'Row preview did not play');
  assert(
    decodeURIComponent(fake.src.split('streaming://local/')[1]) === tracks[0],
    'Preview URL did not encode the source'
  );
  fake.duration = 240;
  await emit('loadedmetadata');
  fake.currentTime = 65;
  await emit('timeupdate');
  assert(
    !seek.disabled && context.elapsed === 65 && context.duration === 240,
    'Metadata/time did not update scrubber'
  );
  results.push('PASS selected preview source, duration and elapsed-time display');
  await change(seek, 120);
  assert(fake.currentTime === 120 && !fake.paused, 'Seeking changed playback state');
  await click(button('Pause preview'));
  assert(
    fake.paused && !context.isPlaying && context.currentTrack === tracks[0],
    'Pause discarded selected preview'
  );
  await change(seek, 180);
  assert(fake.currentTime === 180 && fake.paused, 'Paused seek resumed audio');
  const sources = fake.sources;
  await click(button('Play preview'));
  assert(
    fake.sources === sources && fake.currentTime === 180 && context.isPlaying,
    'Resume reloaded or lost seek position'
  );
  results.push('PASS playing/paused seeking and resume without reloading');
  await change(document.querySelector('[aria-label="Preview volume"]'), 0.42);
  assert(fake.volume === 0.42, 'Volume did not update');
  fake.currentTime = 240;
  fake.ended = true;
  fake.paused = true;
  await emit('ended');
  assert(!context.isPlaying && context.elapsed === 240, 'End left preview playing');
  await click(button('Play preview'));
  assert(fake.currentTime === 0 && context.isPlaying, 'Ended preview did not replay from zero');
  results.push('PASS volume, completed-track controls and replay');
  await click([...document.querySelectorAll('button[aria-label="Play track preview"]')].at(-1));
  assert(
    context.currentTrack === tracks[1] && context.elapsed === 0 && context.duration === 0,
    'New track inherited old progress'
  );
  fake.duration = 3601;
  await emit('loadedmetadata');
  assert(document.body.textContent.includes('1:00:01'), 'Long track time format missing');
  fake.error = { code: 4 };
  await emit('error');
  assert(
    document.querySelector('[role="alert"]') && seek.disabled && !context.isPlaying,
    'Preview error hidden'
  );
  await click(button('Play preview'));
  assert(
    !document.querySelector('[role="alert"]') && context.isPlaying,
    'Retry did not clear preview error'
  );
  results.push('PASS track changes, hour-long durations, media failures and retry');
  await click(button('Stop preview'));
  assert(
    !context.currentTrack && context.elapsed === 0 && context.duration === 0 && !fake.src,
    'Stop failed to reset preview'
  );
  let reject;
  fake.nextPlay = new Promise((_resolve, fail) => {
    reject = fail;
  });
  await click(button('Play track preview'));
  await click([...document.querySelectorAll('button[aria-label="Play track preview"]')].at(-1));
  await act(async () => {
    reject(new Error('Late failure'));
  });
  assert(
    context.currentTrack === tracks[1] && !context.error && context.isPlaying,
    'Old play failure damaged new preview'
  );
  results.push('PASS stop reset and stale play-promise rejection handling');
  await act(async () => {
    window.dispatchEvent(new Event('resetAudio'));
  });
  assert(!context.currentTrack && !fake.src, 'Editor reset retained audio');
  const old = fake;
  await act(async () => {
    root.render(null);
  });
  assert(
    old.listeners.size === 0 && old.paused && !old.src,
    'Unmount left listeners or audio active'
  );
  results.push('PASS editor reset and unmount release audio and listeners');
  await act(async () => {
    root.render(<PreviewFixture />);
  });
  await click(button('Play track preview'));
  fake.duration = 279;
  fake.currentTime = 87;
  await emit('loadedmetadata');
  window.showPreviewTheme = async (theme) => {
    document.documentElement.className = theme;
    document.documentElement.dataset.editorTheme = theme === 'theme-1' ? 'light' : 'dark';
  };
  window.restoreNativeAudio = () => {
    window.Audio = nativeAudio;
  };
  return results;
})();
