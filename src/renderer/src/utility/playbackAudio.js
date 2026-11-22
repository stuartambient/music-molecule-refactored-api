// Keep one stable event target for scrubbers while switching playback engines.
export class PlaybackAudio extends EventTarget {
  constructor(nativeAudio) {
    super();
    this.nativeAudio = nativeAudio;
    this.transport = null;
    this.forwarders = new Map();
    this.useTransport(null);
  }

  useTransport(transport) {
    const target = transport || this.nativeAudio;
    if (target === this.transport) return;
    const volume = this.transport?.volume ?? this.nativeAudio.volume;
    this.transport?.pause();
    for (const [name, listener] of this.forwarders)
      this.transport?.removeEventListener(name, listener);
    this.forwarders.clear();
    this.transport = target;
    target.volume = volume;
    for (const name of [
      'timeupdate',
      'loadedmetadata',
      'durationchange',
      'emptied',
      'seeking',
      'seeked',
      'volumechange',
      'ended',
      'error'
    ]) {
      const listener = () => this.dispatchEvent(new Event(name));
      this.forwarders.set(name, listener);
      target.addEventListener(name, listener);
    }
    this.dispatchEvent(new Event('emptied'));
  }

  get currentTime() {
    return this.transport.currentTime;
  }
  set currentTime(value) {
    this.transport.currentTime = value;
  }
  get duration() {
    return this.transport.duration;
  }
  get volume() {
    return this.transport.volume;
  }
  set volume(value) {
    this.transport.volume = value;
  }
  get paused() {
    return this.transport.paused;
  }
  get ended() {
    return this.transport.ended;
  }
  get seeking() {
    return this.transport.seeking;
  }
  get error() {
    return this.transport.error;
  }
  get src() {
    return this.transport.src;
  }
  set src(value) {
    this.transport.src = value;
  }
  play() {
    return this.transport.play();
  }
  pause() {
    this.transport.pause();
  }
  load() {
    this.transport.load();
  }
  removeAttribute(name) {
    this.transport.removeAttribute(name);
  }
}
