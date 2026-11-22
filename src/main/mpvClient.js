import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { mpvCompatibilityScript } from './mpvCompatibility.js';

export class MpvClient extends EventEmitter {
  constructor({ executable, extraArgs = [], timeout = 10000 }) {
    super();
    this.executable = executable;
    this.extraArgs = extraArgs;
    this.timeout = timeout;
    this.pending = new Map();
    this.nextRequest = 0;
    this.closing = false;
    this.stderr = '';
  }

  start() {
    if (this.closing) return Promise.reject(new Error('The mpv player has closed.'));
    if (this.starting) return this.starting;
    this.starting = this.connect().catch((error) => {
      this.starting = null;
      this.child?.kill();
      throw error;
    });
    return this.starting;
  }

  async connect() {
    const id = `music-molecule-${process.pid}-${randomUUID()}`;
    const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\${id}` : path.join(tmpdir(), id);
    const scriptRoot = await mkdtemp(path.join(tmpdir(), 'music-molecule-mpv-'));
    const scriptPath = path.join(scriptRoot, 'compatibility.lua');
    await writeFile(scriptPath, mpvCompatibilityScript, 'utf8');
    const child = spawn(
      this.executable,
      [
        '--no-config',
        '--idle=yes',
        '--no-terminal',
        '--no-video',
        '--audio-display=no',
        '--osc=no',
        '--input-default-bindings=no',
        '--input-vo-keyboard=no',
        '--load-scripts=no',
        `--script=${scriptPath}`,
        '--ytdl=no',
        '--autoload-files=no',
        '--keep-open=no',
        '--gapless-audio=yes',
        '--prefetch-playlist=yes',
        '--cache=yes',
        '--demuxer-max-bytes=32MiB',
        '--demuxer-readahead-secs=10',
        '--volume-max=100',
        `--input-ipc-server=${endpoint}`,
        ...this.extraArgs
      ],
      { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], shell: false }
    );
    this.child = child;
    child.once('close', () => {
      void unlink(scriptPath)
        .then(() => rmdir(scriptRoot))
        .catch(() => {});
    });
    let spawnError;
    child.on('error', (error) => {
      spawnError = error;
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (text) => {
      this.stderr = (this.stderr + text).slice(-8192);
    });
    child.once('exit', (code) => {
      this.rejectPending(
        new Error(`mpv stopped${code === null ? '' : ` (${code})`}. ${this.stderr}`.trim())
      );
      if (this.child === child) {
        this.starting = null;
        this.socket?.destroy();
        this.socket = null;
        if (!this.closing)
          this.emit(
            'failure',
            new Error('The mpv playback process stopped. Select a track to retry.')
          );
      }
    });
    const deadline = Date.now() + this.timeout;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`mpv could not start. ${this.stderr}`);
      const socket = await new Promise((resolve) => {
        const candidate = createConnection(endpoint);
        candidate.once('connect', () => {
          candidate.removeAllListeners('error');
          resolve(candidate);
        });
        candidate.once('error', () => {
          candidate.destroy();
          resolve(null);
        });
      });
      if (socket) {
        if (this.closing) {
          socket.destroy();
          throw new Error('The mpv player has closed.');
        }
        this.socket = socket;
        this.buffer = '';
        socket.setEncoding('utf8');
        socket.on('data', (text) => this.receive(text));
        socket.on('error', (error) => this.rejectPending(error));
        socket.on('close', () => {
          this.rejectPending(new Error('The mpv connection closed.'));
          if (this.socket === socket && !this.closing) {
            // A broken connection must stop audio rather than leave an orphan
            // playing behind controls which can no longer reach it.
            this.child?.kill();
          }
        });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new Error('Timed out connecting to mpv.');
  }

  receive(text) {
    this.buffer += text;
    if (this.buffer.length > 4 * 1024 * 1024) {
      this.rejectPending(new Error('mpv sent an oversized response.'));
      this.socket.destroy();
      return;
    }
    let end;
    while ((end = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      const waiting = this.pending.get(message.request_id);
      if (waiting) {
        this.pending.delete(message.request_id);
        clearTimeout(waiting.timer);
        if (message.error && message.error !== 'success')
          waiting.reject(new Error(`mpv: ${message.error}`));
        else waiting.resolve(message.data);
      }
      if (message.event) this.emit('event', message);
    }
  }

  async command(command) {
    await this.start();
    const request = ++this.nextRequest;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request);
        reject(new Error(`mpv command timed out: ${command[0]}`));
      }, this.timeout);
      timer.unref?.();
      this.pending.set(request, { resolve, reject, timer });
      this.socket.write(JSON.stringify({ command, request_id: request }) + '\n', (error) => {
        if (error && this.pending.has(request)) {
          clearTimeout(timer);
          this.pending.delete(request);
          reject(error);
        }
      });
    });
  }
  rejectPending(error) {
    for (const waiting of this.pending.values()) {
      clearTimeout(waiting.timer);
      waiting.reject(error);
    }
    this.pending.clear();
  }
  async close() {
    if (this.closing) return;
    this.closing = true;
    const child = this.child;
    if (this.socket && !this.socket.destroyed)
      this.socket.write(JSON.stringify({ command: ['quit'] }) + '\n');
    this.rejectPending(new Error('The mpv player has closed.'));
    if (child && child.exitCode === null) {
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          child.kill();
          resolve();
        }, 500);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    this.socket?.destroy();
  }
}
