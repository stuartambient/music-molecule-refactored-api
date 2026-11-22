import { EventEmitter } from 'node:events';
import { MpvClient } from './mpvClient.js';
import { createMusicAvailabilityCheck } from './musicAvailability.js';

const sameTrack = (a, b) => a?.track_id === b?.track_id && a?.audiotrack === b?.audiotrack;

export class MpvService extends EventEmitter {
  constructor(options) {
    super();
    this.client = options.client || new MpvClient(options);
    this.check = options.check || ((file) => createMusicAvailabilityCheck()(file));
    this.mutations = Promise.resolve();
    this.revision = 0;
    this.session = null;
    this.entries = new Map();
    this.observing = null;
    this.client.on('event', (event) => this.onEvent(event));
    this.client.on('failure', (error) => {
      this.observing = null;
      if (this.session) {
        this.halted = true;
        this.loading = false;
        this.publish('error', { paused: true, error: { message: error.message } });
      }
    });
  }
  publish(type, patch = {}) {
    if (!this.session) return;
    this.state = { ...this.state, ...patch };
    this.emit('state', { ...this.state, type, sessionId: this.session.sessionId });
  }
  enqueue(operation) {
    const job = this.mutations.then(operation);
    this.mutations = job.catch(() => {});
    return job;
  }
  async observe() {
    if (this.observing) return this.observing;
    this.observing = (async () => {
      await this.client.start();
      let id = 0;
      for (const name of ['time-pos', 'duration', 'pause', 'volume', 'seeking'])
        await this.client.command(['observe_property', ++id, name]);
    })();
    try {
      await this.observing;
    } catch (error) {
      this.observing = null;
      throw error;
    }
  }
  async load(config, queue) {
    const revision = ++this.revision;
    this.loading = true;
    this.pendingErrors = [];
    this.halted = false;
    this.session = { ...config, queue };
    this.entries.clear();
    this.state = {
      trackId: queue[config.index].track_id,
      index: config.index,
      position: config.startTime,
      duration: null,
      paused: true,
      volume: config.volume,
      ready: false,
      ended: false,
      entryKey: null
    };
    // An obsolete sleeping-drive check must not block a newer selection.
    if (this.client.socket)
      void this.client.command(['set_property', 'pause', true]).catch(() => {});
    let availability;
    try {
      availability = await this.check(queue[config.index].audiotrack);
    } catch (error) {
      availability = { available: false, message: error.message };
    }
    if (revision !== this.revision) return { ok: false, cancelled: true };
    return this.enqueue(async () => {
      try {
        if (revision !== this.revision) return { ok: false, cancelled: true };
        if (!availability.available) {
          this.loading = false;
          this.halted = true;
          if (this.client.socket) await this.client.command(['stop']);
          this.publish('error', { error: availability });
          return { ok: false, error: availability };
        }
        await this.observe();
        if (revision !== this.revision) return { ok: false, cancelled: true };
        await this.client.command(['set_property', 'pause', true]);
        await this.client.command(['stop']);
        await this.client.command(['playlist-clear']);
        await this.client.command(['set_property', 'gapless-audio', config.gapless ? 'yes' : 'no']);
        await this.client.command(['set_property', 'volume', config.volume * 100]);
        const tail =
          config.source === 'albumTracksActive' ? [queue[config.index]] : queue.slice(config.index);
        await this.client.command([
          'loadfile',
          tail[0].audiotrack,
          'replace',
          -1,
          { start: String(config.startTime) }
        ]);
        for (const track of tail.slice(1)) {
          if (revision !== this.revision) return { ok: false, cancelled: true };
          await this.client.command(['loadfile', track.audiotrack, 'append']);
        }
        await this.mapEntries(tail, config.index);
        if (revision !== this.revision) return { ok: false, cancelled: true };
        this.loading = false;
        for (const event of this.pendingErrors.splice(0)) {
          if (this.entries.has(event.playlist_entry_id)) this.onEvent(event);
        }
        if (this.halted) return { ok: false, error: this.state.error };
        await this.refresh(config.sessionId);
        return { ok: true };
      } catch (error) {
        if (revision === this.revision) {
          this.loading = false;
          this.halted = true;
          this.publish('error', { error: { message: error.message } });
        }
        return { ok: false, error: { message: error.message } };
      }
    });
  }
  async mapEntries(tail, base) {
    const playlist = await this.client.command(['get_property', 'playlist']);
    this.entries = new Map(
      playlist.map((entry, index) => [entry.id, { track: tail[index], index: base + index }])
    );
    this.lastEntry = playlist.at(-1)?.id;
  }
  async get(name) {
    try {
      return await this.client.command(['get_property', name]);
    } catch {
      return null;
    }
  }
  async refresh(sessionId) {
    const entryRevision = this.entryRevision;
    const [playlist, position, duration, paused, volume] = await Promise.all(
      ['playlist', 'time-pos', 'duration', 'pause', 'volume'].map((name) => this.get(name))
    );
    if (
      this.session?.sessionId !== sessionId ||
      this.loading ||
      this.halted ||
      entryRevision !== this.entryRevision
    )
      return;
    const playing =
      playlist?.find((entry) => entry.playing) || playlist?.find((entry) => entry.current);
    const mapped = this.entries.get(playing?.id);
    if (!mapped?.track) return;
    this.currentId = playing.id;
    this.publish('status', {
      trackId: mapped.track.track_id,
      index: mapped.index,
      entryKey: sessionId + ':' + playing.id,
      position: Number.isFinite(position) ? position : 0,
      duration,
      ready: Number.isFinite(duration) && duration > 0,
      paused: paused ?? true,
      volume: Number.isFinite(volume) ? volume / 100 : this.state.volume,
      ended: false
    });
  }
  onEvent(event) {
    if (event.event === 'start-file') this.entryRevision = (this.entryRevision || 0) + 1;
    if (!this.session || this.halted) return;
    if (this.loading) {
      // A decoder may reject a file before the native playlist IDs are mapped.
      // Keep that failure until we can attach it to the right catalog entry.
      if (event.event === 'end-file' && ['error', 'eof'].includes(event.reason))
        (this.pendingErrors ||= []).push(event);
      return;
    }
    const sessionId = this.session.sessionId;
    if (event.event === 'start-file') {
      const mapped = this.entries.get(event.playlist_entry_id);
      if (!mapped?.track) return;
      this.currentId = event.playlist_entry_id;
      this.publish('track', {
        trackId: mapped.track.track_id,
        index: mapped.index,
        entryKey: sessionId + ':' + this.currentId,
        position: 0,
        duration: null,
        ready: false,
        ended: false
      });
    } else if (event.event === 'file-loaded') {
      void this.refresh(sessionId);
    } else if (event.event === 'property-change') {
      if (event.data === undefined || !this.state.entryKey) return;
      const key = {
        'time-pos': 'position',
        duration: 'duration',
        pause: 'paused',
        volume: 'volume',
        seeking: 'seeking'
      }[event.name];
      if (!key) return;
      const value = key === 'volume' ? event.data / 100 : event.data;
      this.state = { ...this.state, [key]: value };
      if (key === 'position') {
        if (!this.timer)
          this.timer = setTimeout(() => {
            this.timer = null;
            this.publish('status');
          }, 100);
      } else this.publish('status');
    } else if (event.event === 'end-file') {
      if (event.reason === 'error') {
        const failed = this.entries.get(event.playlist_entry_id);
        this.halted = true;
        void this.client
          .command(['set_property', 'pause', true])
          .then(() => this.client.command(['stop']))
          .catch(() => {});
        this.publish('error', {
          ...(failed?.track
            ? {
                trackId: failed.track.track_id,
                index: failed.index,
                entryKey: sessionId + ':' + event.playlist_entry_id
              }
            : {}),
          paused: true,
          error: {
            message:
              'mpv could not read or decode this track. Check that its drive and file are available.',
            detail: event.file_error || event.error || ''
          }
        });
      } else if (event.reason === 'eof' && event.playlist_entry_id === this.lastEntry) {
        this.publish('ended', {
          ended: true,
          paused: true,
          position: this.state.duration || this.state.position
        });
      }
    }
  }
  control(sessionId, operation, value) {
    return this.enqueue(async () => {
      if (this.session?.sessionId !== sessionId || this.halted)
        return { ok: false, cancelled: true };
      // mpv becomes idle after the final EOF. Reload the selected entry before
      // replaying or seeking; an unpause alone cannot restart an idle player.
      if (this.state.ended && (operation === 'seek' || (operation === 'pause' && !value))) {
        const current = this.entries.get(this.currentId);
        if (!current?.track) return { ok: false, cancelled: true };
        this.loading = true;
        try {
          await this.client.command(['set_property', 'pause', true]);
          await this.client.command([
            'loadfile',
            current.track.audiotrack,
            'replace',
            -1,
            { start: String(operation === 'seek' ? value : 0) }
          ]);
          await this.mapEntries([current.track], current.index);
        } finally {
          this.loading = false;
        }
        await this.refresh(sessionId);
        if (operation === 'seek') return { ok: true };
      }
      if (operation === 'pause') await this.client.command(['set_property', 'pause', value]);
      else if (operation === 'seek') await this.client.command(['seek', value, 'absolute+exact']);
      else if (operation === 'volume')
        await this.client.command(['set_property', 'volume', value * 100]);
      return { ok: true };
    });
  }
  updateQueue(sessionId, queue) {
    return this.enqueue(async () => {
      if (
        this.session?.sessionId !== sessionId ||
        this.loading ||
        this.halted ||
        this.session.source === 'albumTracksActive'
      )
        return { ok: false, cancelled: true };
      const revision = this.revision;
      const currentSession = this.session;
      const stillCurrent = () => revision === this.revision && this.session === currentSession;
      this.loading = true;
      try {
        const playlist = await this.client.command(['get_property', 'playlist']);
        if (!stillCurrent()) return { ok: false, cancelled: true };
        const nativeCurrent =
          playlist.find((entry) => entry.playing) || playlist.find((entry) => entry.current);
        const currentId = nativeCurrent?.id ?? this.currentId;
        const current = this.entries.get(currentId);
        if (!current?.track) return { ok: false, cancelled: true };
        this.currentId = currentId;
        const index = sameTrack(queue[current.index], current.track)
          ? current.index
          : queue.findIndex((track) => sameTrack(track, current.track));
        const nextIndex = index < 0 ? current.index : index + 1;
        const playing = playlist.findIndex((entry) => entry.id === currentId);
        for (let i = playlist.length - 1; i > playing; i--) {
          await this.client.command(['playlist-remove', i]);
          if (!stillCurrent()) return { ok: false, cancelled: true };
        }
        const tail = queue.slice(nextIndex);
        for (const track of tail) {
          await this.client.command(['loadfile', track.audiotrack, 'append']);
          if (!stillCurrent()) return { ok: false, cancelled: true };
        }
        const updated = await this.client.command(['get_property', 'playlist']);
        if (!stillCurrent()) return { ok: false, cancelled: true };
        const retained = new Map();
        for (let i = 0; i <= playing; i++)
          if (this.entries.has(updated[i]?.id))
            retained.set(updated[i].id, this.entries.get(updated[i].id));
        retained.set(currentId, { track: current.track, index: index < 0 ? current.index : index });
        tail.forEach((track, i) =>
          retained.set(updated[playing + 1 + i].id, { track, index: nextIndex + i })
        );
        this.entries = retained;
        this.lastEntry = updated.at(-1)?.id;
        currentSession.queue = queue;
      } finally {
        if (stillCurrent()) {
          this.loading = false;
          for (const event of (this.pendingErrors || []).splice(0))
            if (this.entries.has(event.playlist_entry_id)) this.onEvent(event);
        }
      }
      await this.refresh(sessionId);
      return { ok: true };
    });
  }
  stop(sessionId) {
    if (!this.session || this.session.sessionId !== sessionId)
      return Promise.resolve({ ok: false, cancelled: true });
    ++this.revision;
    this.session = null;
    this.entries.clear();
    clearTimeout(this.timer);
    this.timer = null;
    return this.enqueue(async () => {
      if (this.session || this.client.closing) return { ok: false, cancelled: true };
      try {
        await this.client.command(['stop']);
        await this.client.command(['playlist-clear']);
        return { ok: true };
      } catch (error) {
        // Renderer disposal can race the application's process shutdown.
        if (this.client.closing) return { ok: false, cancelled: true };
        throw error;
      }
    });
  }
  close() {
    ++this.revision;
    this.session = null;
    clearTimeout(this.timer);
    return this.client.close();
  }
}
