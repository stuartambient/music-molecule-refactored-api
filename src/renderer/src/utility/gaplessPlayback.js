export const streamingSource = (track) =>
  'streaming://' +
  encodeURI(track.audiotrack).replaceAll('?', '%3F').replaceAll('#', '%23') +
  '?playback=' +
  crypto.randomUUID();

const sameTrack = (a, b) => a?.track_id === b?.track_id && a?.audiotrack === b?.audiotrack;
const bufferBytes = (buffer) => buffer.length * buffer.numberOfChannels * 4;
const maxBufferBytes = 512 * 1024 * 1024;
const maxFileBytes = 512 * 1024 * 1024;

export async function loadGaplessBuffer(context, track, signal) {
  const availability = await window.ipcApi.checkTrackAvailability(track.audiotrack);
  signal.throwIfAborted();
  if (!availability.available)
    throw Object.assign(new Error(availability.message), { availability });
  const response = await fetch(streamingSource(track), { signal });
  if (!response.ok) throw new Error('The player could not read this track.');
  // Bound compressed input as well as retained decoded audio.
  if (Number(response.headers.get('content-length')) > maxFileBytes)
    throw new Error('This file exceeds the 512 MiB limit for buffered gapless playback.');
  const bytes = await response.arrayBuffer();
  signal.throwIfAborted();
  if (bytes.byteLength > maxFileBytes)
    throw new Error('This file exceeds the 512 MiB limit for buffered gapless playback.');
  let buffer;
  try {
    buffer = await context.decodeAudioData(bytes);
  } catch (error) {
    throw new Error('The audio decoder could not prepare this track for gapless playback.', {
      cause: error
    });
  }
  signal.throwIfAborted();
  if (!buffer.length || bufferBytes(buffer) > maxBufferBytes)
    throw new Error('The decoded track exceeds the 512 MiB gapless audio buffer limit.');
  return buffer;
}

// Only the current and upcoming decoded tracks are retained. Sources are joined
// on the audio clock; JS callbacks update the UI but do not trigger the join.
export class GaplessPlayback extends EventTarget {
  constructor({
    track,
    index,
    queue,
    startTime = 0,
    callbacks,
    context = new AudioContext(),
    load = loadGaplessBuffer,
    tick = (callback, delay) => setInterval(callback, delay),
    untick = (id) => clearInterval(id)
  }) {
    super();
    this.kind = 'gapless';
    this.context = context;
    this.loadBuffer = load;
    this.callbacks = callbacks;
    this.queue = queue;
    this.entry = { track, index, offset: startTime, buffer: null, source: null, token: null };
    this.next = null;
    this.disposed = false;
    this.wantsPlayback = false;
    this.ended = false;
    this.seeking = false;
    this.waiting = false;
    this.playVersion = 0;
    this.nextVersion = 0;
    this.gain = context.createGain();
    this.gain.connect(context.destination);
    this.controller = new AbortController();
    this.untick = untick;
    this.timer = tick(() => {
      if (this.wantsPlayback && !this.waiting && this.entry.buffer) this.emit('timeupdate');
    }, 100);
    this.ready = this.loadCurrent();
  }

  emit(name) {
    if (!this.disposed) this.dispatchEvent(new Event(name));
  }
  isCurrent() {
    return !this.disposed;
  }
  get duration() {
    return this.entry.buffer?.duration || NaN;
  }
  get paused() {
    return !this.wantsPlayback;
  }
  get volume() {
    return this.gain.gain.value;
  }
  set volume(value) {
    this.gain.gain.value = Math.max(0, Math.min(1, value));
    this.emit('volumechange');
    this.callbacks.onVolume?.(this.volume);
  }
  get currentTime() {
    const entry = this.entry;
    const elapsed =
      entry.source && this.wantsPlayback ? Math.max(0, this.context.currentTime - entry.start) : 0;
    return Math.min(this.duration || Infinity, entry.offset + elapsed);
  }
  set currentTime(value) {
    if (!Number.isFinite(value)) return;
    this.entry.offset = Math.max(
      0,
      Math.min(Number.isFinite(this.duration) ? this.duration : Infinity, value)
    );
    this.stopSources();
    this.waiting = false;
    this.ended = false;
    this.seeking = true;
    this.emit('seeking');
    this.callbacks.onSeeking?.(true);
    this.seeking = false;
    this.emit('seeked');
    this.emit('timeupdate');
    this.callbacks.onSeeking?.(false);
    if (this.wantsPlayback) this.play().catch((error) => this.fail(error));
  }
  getPosition() {
    return this.entry.buffer ? (this.ended ? 0 : this.currentTime) : undefined;
  }

  async loadCurrent() {
    try {
      const buffer = await this.loadBuffer(this.context, this.entry.track, this.controller.signal);
      if (this.disposed) return;
      this.entry.buffer = buffer;
      if (this.entry.offset >= buffer.duration) this.entry.offset = 0;
      this.emit('loadedmetadata');
      this.emit('timeupdate');
      this.callbacks.onMetadata();
      this.updateQueue(this.queue);
      if (this.wantsPlayback) await this.play();
    } catch (error) {
      if (!this.disposed && error.name !== 'AbortError') this.fail(error);
    }
  }

  fail(error) {
    this.pause();
    if (error.availability) this.callbacks.onError(error.availability);
    else this.callbacks.onFallback(error);
  }

  updateQueue(queue) {
    this.queue = queue;
    if (!this.entry.buffer || this.disposed) return;
    const entry = this.entry;
    const position = sameTrack(queue[entry.index], entry.track)
      ? entry.index
      : queue.findIndex((track) => sameTrack(track, entry.track));
    const index = position < 0 ? entry.index : position + 1;
    const track = queue[index];
    if (this.next?.index === index && sameTrack(this.next.track, track)) return;
    this.nextVersion++;
    this.nextController?.abort();
    this.stopSource(this.next);
    this.next = null;
    if (!track) {
      if (this.waiting && this.wantsPlayback) this.finish();
      return;
    }
    const version = this.nextVersion;
    const next = { track, index, offset: 0, buffer: null, source: null, token: null };
    this.next = next;
    this.nextController = new AbortController();
    this.loadBuffer(this.context, track, this.nextController.signal)
      .then((buffer) => {
        if (this.disposed || version !== this.nextVersion) return;
        if (bufferBytes(buffer) + bufferBytes(this.entry.buffer) > maxBufferBytes)
          throw new Error('These tracks together exceed the 512 MiB gapless audio buffer limit.');
        next.buffer = buffer;
        this.scheduleNext();
      })
      .catch((error) => {
        if (this.disposed || version !== this.nextVersion || error.name === 'AbortError') return;
        next.failed = true;
        if (this.waiting && this.wantsPlayback) this.finish();
      });
  }

  stopSource(entry) {
    if (!entry?.source) return;
    entry.source.onended = null;
    entry.source.stop();
    entry.source.disconnect();
    entry.source = null;
  }
  stopSources() {
    this.playVersion++;
    this.stopSource(this.entry);
    this.stopSource(this.next);
  }
  schedule(entry, when) {
    const source = this.context.createBufferSource();
    source.buffer = entry.buffer;
    source.connect(this.gain);
    entry.start = when;
    entry.source = source;
    source.onended = () => {
      if (!this.disposed && this.entry === entry && this.wantsPlayback) this.boundary();
    };
    source.start(when, entry.offset);
  }
  scheduleNext() {
    if (!this.wantsPlayback || !this.next?.buffer || this.next.source) return;
    if (this.waiting) {
      this.schedule(this.next, this.context.currentTime + 0.02);
      this.promote();
    } else if (this.entry.source) {
      const end = this.entry.start + this.duration - this.entry.offset;
      if (end <= this.context.currentTime) return;
      this.schedule(this.next, end);
    }
  }
  boundary() {
    if (this.next?.source) this.promote();
    else if (this.next?.buffer) {
      this.waiting = true;
      this.scheduleNext();
    } else if (this.next && !this.next.failed) {
      this.waiting = true;
      this.entry.offset = this.duration;
      this.stopSource(this.entry);
    } else this.finish();
  }
  promote() {
    const previous = this.entry;
    this.entry = this.next;
    this.next = null;
    this.entry.token = crypto.randomUUID();
    this.waiting = false;
    this.stopSource(previous);
    this.emit('loadedmetadata');
    this.emit('timeupdate');
    this.callbacks.onTransition(this.entry.track, this.entry.index, this.entry.token);
    // The hook acknowledges the handoff with the new request before preloading
    // another track. The audio for this entry is already scheduled and playing.
  }
  adopt(track, index, token, callbacks) {
    if (
      !token ||
      token !== this.entry.token ||
      !sameTrack(track, this.entry.track) ||
      index !== this.entry.index
    )
      return false;
    this.callbacks = callbacks;
    this.callbacks.onMetadata();
    this.updateQueue(this.queue);
    return true;
  }
  finish() {
    if (this.ended || this.disposed) return;
    this.entry.offset = Number.isFinite(this.duration) ? this.duration : 0;
    this.stopSources();
    this.ended = true;
    this.waiting = false;
    this.wantsPlayback = false;
    this.emit('timeupdate');
    this.emit('ended');
    this.callbacks.onEnded();
  }
  async play() {
    this.wantsPlayback = true;
    const version = ++this.playVersion;
    await this.context.resume();
    if (
      this.disposed ||
      !this.wantsPlayback ||
      version !== this.playVersion ||
      !this.entry.buffer ||
      this.entry.source
    )
      return;
    if (this.waiting) {
      if (!this.next || this.next.failed) this.finish();
      else this.scheduleNext();
      return;
    }
    if (this.ended) {
      this.entry.offset = 0;
      this.ended = false;
    }
    this.schedule(this.entry, this.context.currentTime + 0.02);
    this.scheduleNext();
  }
  pause() {
    if (this.disposed) return;
    this.entry.offset = this.currentTime;
    this.wantsPlayback = false;
    this.stopSources();
    this.context.suspend().catch(() => {});
    this.emit('timeupdate');
  }
  dispose() {
    if (this.disposed) return;
    this.pause();
    this.disposed = true;
    this.controller.abort();
    this.nextController?.abort();
    this.untick(this.timer);
    this.gain.disconnect();
    this.context.close().catch(() => {});
    this.entry.buffer = null;
    this.next = null;
  }
}
