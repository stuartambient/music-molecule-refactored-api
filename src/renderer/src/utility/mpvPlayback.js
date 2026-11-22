const sameTrack = (a, b) => a?.track_id === b?.track_id && a?.audiotrack === b?.audiotrack;

export class MpvPlayback extends EventTarget {
  constructor({
    track,
    index,
    queue,
    source,
    gapless,
    startTime = 0,
    volume = 1,
    callbacks,
    api = window.ipcApi
  }) {
    super();
    this.kind = 'mpv';
    this.api = api;
    this.callbacks = callbacks;
    this.sessionId = crypto.randomUUID();
    this.track = track;
    this.index = index;
    this.queue = queue;
    this.position = startTime;
    this.duration = NaN;
    this.readyState = false;
    this.wantsPlayback = false;
    this.disposed = false;
    this.ended = false;
    this.seeking = false;
    this.level = volume;
    this.unsubscribe = api.on('mpv-state', (snapshot) => this.receive(snapshot));
    this.ready = Promise.resolve(
      api.mpvLoad({
        sessionId: this.sessionId,
        ids: queue.map((entry) => entry.track_id),
        index,
        source,
        gapless: !!gapless,
        startTime,
        volume: this.level
      })
    )
      .then((result) => {
        if (this.disposed) return;
        if (!result?.ok && !result?.cancelled)
          throw new Error(result?.error?.message || 'mpv could not load this track.');
        this.loaded = !!result?.ok;
      })
      .catch((error) => {
        if (!this.disposed) this.fail({ message: error.message });
      });
  }
  emit(name) {
    if (!this.disposed) this.dispatchEvent(new Event(name));
  }
  isCurrent() {
    return !this.disposed;
  }
  get currentTime() {
    return this.position;
  }
  set currentTime(value) {
    if (!Number.isFinite(value)) return;
    this.position = Math.max(
      0,
      Math.min(Number.isFinite(this.duration) ? this.duration : Infinity, value)
    );
    this.seeking = true;
    this.pendingSeek = true;
    this.callbacks.onSeeking(true);
    this.emit('seeking');
    this.emit('timeupdate');
    void this.control('seek', this.position).then(() => {
      if (this.disposed) return;
      this.pendingSeek = false;
      this.seeking = false;
      this.callbacks.onSeeking(false);
      this.emit('seeked');
      this.emit('timeupdate');
    });
  }
  get paused() {
    return !this.wantsPlayback;
  }
  get volume() {
    return this.level;
  }
  set volume(value) {
    this.level = Math.max(0, Math.min(1, value));
    this.callbacks.onVolume(this.level);
    this.emit('volumechange');
    void this.control('volume', this.level);
  }
  getPosition() {
    return this.readyState ? (this.ended ? 0 : this.position) : undefined;
  }
  async control(operation, value) {
    await this.ready;
    if (this.disposed || !this.loaded) return;
    try {
      const result = await this.api.mpvControl({ sessionId: this.sessionId, operation, value });
      if (!result?.ok && !result?.cancelled)
        throw new Error(result?.error?.message || 'mpv playback command failed.');
    } catch (error) {
      if (!this.disposed) this.fail({ message: error.message });
    }
  }
  play() {
    this.wantsPlayback = true;
    return this.control('pause', false);
  }
  pause() {
    this.wantsPlayback = false;
    void this.control('pause', true);
  }
  fail(error) {
    if (this.failed) return;
    this.failed = true;
    this.wantsPlayback = false;
    this.error = error;
    this.callbacks.onError(error);
  }
  receive(snapshot) {
    if (this.disposed || snapshot.sessionId !== this.sessionId) return;
    const next = this.queue[snapshot.index];
    const changed =
      snapshot.trackId !== this.track.track_id ||
      (snapshot.index !== this.index &&
        this.entryKey &&
        snapshot.entryKey &&
        snapshot.entryKey !== this.entryKey);
    if (snapshot.entryKey) this.entryKey = snapshot.entryKey;
    if (!changed && next && sameTrack(next, this.track)) this.index = snapshot.index;
    if (changed) {
      if (!next || next.track_id !== snapshot.trackId) return;
      this.track = next;
      this.index = snapshot.index;
      this.token = snapshot.entryKey;
      this.readyState = false;
      this.duration = NaN;
      this.position = 0;
      this.error = null;
      this.failed = false;
    }
    if (!this.pendingSeek && Number.isFinite(snapshot.position)) this.position = snapshot.position;
    if (Number.isFinite(snapshot.duration)) this.duration = snapshot.duration;
    if (Number.isFinite(snapshot.volume) && Math.abs(snapshot.volume - this.level) > 0.0005) {
      this.level = snapshot.volume;
      this.callbacks.onVolume(this.level);
      this.emit('volumechange');
    }
    if (snapshot.ended === false) this.ended = false;
    const becameReady = snapshot.ready && !this.readyState;
    if (snapshot.ready) this.readyState = true;
    if (changed) {
      if (snapshot.error) this.error = snapshot.error;
      this.callbacks.onTransition(this.track, this.index, this.token);
    } else if (snapshot.error) {
      this.fail(snapshot.error);
    }
    if (becameReady) {
      this.emit('loadedmetadata');
      if (!changed) this.callbacks.onMetadata();
    }
    this.emit('timeupdate');
    if (snapshot.type === 'ended' && !this.ended) {
      this.ended = true;
      this.wantsPlayback = false;
      this.emit('ended');
      this.callbacks.onEnded();
    }
  }
  adopt(track, index, token, callbacks) {
    if (!token || token !== this.token || index !== this.index || !sameTrack(track, this.track))
      return false;
    this.callbacks = callbacks;
    if (this.readyState) this.callbacks.onMetadata();
    if (this.error) {
      this.failed = false;
      this.fail(this.error);
    }
    return true;
  }
  updateQueue(queue) {
    if (
      queue.length === this.queue.length &&
      queue.every((entry, index) => sameTrack(entry, this.queue[index]))
    )
      return;
    this.queue = queue;
    void this.ready
      .then(() => {
        if (this.disposed || !this.loaded) return;
        return this.api
          .mpvUpdateQueue({
            sessionId: this.sessionId,
            ids: queue.map((entry) => entry.track_id)
          })
          .then((result) => {
            if (!result?.ok && !result?.cancelled)
              throw new Error(result?.error?.message || 'mpv could not update the queue.');
          });
      })
      .catch((error) => {
        if (!this.disposed) this.fail({ message: error.message });
      });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe?.();
    Promise.resolve(this.api.mpvStop(this.sessionId)).catch(() => {});
  }
}
