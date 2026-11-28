/* global process, __filename, __dirname, console, Buffer */
const { app, BrowserWindow, ipcMain } = require('electron');
const { spawnSync } = require('node:child_process');
if (!process.versions.electron) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const fs = require('node:fs'),
    path = require('node:path');
  const fixture = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'molecule-mpv-ui-'));
  const result = spawnSync(require('electron'), [__filename, fixture], {
    env,
    stdio: 'inherit',
    windowsHide: true
  });
  fs.rmSync(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
} else {
  const fs = require('node:fs'),
    path = require('node:path');
  const { buildSync } = require('esbuild');
  const root = process.argv[2];
  app.setPath('userData', path.join(root, 'profile'));
  app.disableHardwareAcceleration();
  app.whenReady().then(async () => {
    let service, window;
    try {
      const serviceFile = path.join(root, 'service.cjs');
      buildSync({
        entryPoints: [path.join(__dirname, '../src/main/mpvService.js')],
        outfile: serviceFile,
        bundle: true,
        platform: 'node',
        format: 'cjs'
      });
      service = new (require(serviceFile).MpvService)({
        executable: path.resolve('vendor/mpv/windows-x64/mpv.exe'),
        extraArgs: ['--ao=null']
      });
      const queue = [0, 1].map((i) => {
        const file = path.join(root, `${i}.wav`),
          frames = 144000,
          b = Buffer.alloc(44 + frames * 2);
        b.write('RIFF');
        b.writeUInt32LE(b.length - 8, 4);
        b.write('WAVEfmt ', 8);
        b.writeUInt32LE(16, 16);
        b.writeUInt16LE(1, 20);
        b.writeUInt16LE(1, 22);
        b.writeUInt32LE(48000, 24);
        b.writeUInt32LE(96000, 28);
        b.writeUInt16LE(2, 32);
        b.writeUInt16LE(16, 34);
        b.write('data', 36);
        b.writeUInt32LE(frames * 2, 40);
        fs.writeFileSync(file, b);
        return { track_id: `track-${i}`, audiotrack: file, title: `Track ${i}`, duration: 3000 };
      });
      const corrupt = {
        track_id: 'bad-track',
        audiotrack: path.join(root, 'bad.flac'),
        title: 'Broken recording'
      };
      fs.writeFileSync(corrupt.audiotrack, 'not an audio stream');
      queue.push(corrupt);
      ipcMain.handle('repair-fixture', () => {
        fs.copyFileSync(queue[0].audiotrack, corrupt.audiotrack);
      });
      ipcMain.handle('capture-problem-preview', async () => {
        const previews = path.join(root, 'problem-track-previews');
        fs.mkdirSync(previews, { recursive: true });
        window.setContentSize(850, 1050);
        fs.writeFileSync(
          path.join(previews, 'basic.png'),
          (await window.webContents.capturePage()).toPNG()
        );
        window.setContentSize(500, 1050);
        fs.writeFileSync(
          path.join(previews, 'narrow.png'),
          (await window.webContents.capturePage()).toPNG()
        );
      });
      const resolveIds = (ids) =>
        ids.map((id) => {
          const t = queue.find((t) => t.track_id === id);
          if (!t) throw Error('Unknown track');
          return t;
        });
      let preferences = {};
      const handlers = {
        'get-preferences': () => ({ ...preferences }),
        'save-preferences': (patch) => {
          preferences = { ...preferences, ...patch };
          return true;
        },
        'get-roots': () => [],
        'is-liked': () => ({ like: 0 }),
        'get-cover': () => null,
        'check-track-availability': () => ({ available: true }),
        'mpv-status': () => ({ available: true }),
        'mpv-load': (config) => service.load(config, resolveIds(config.ids)),
        'mpv-control': (c) => service.control(c.sessionId, c.operation, c.value),
        'mpv-update-queue': (c) => service.updateQueue(c.sessionId, resolveIds(c.ids)),
        'mpv-stop': (id) => service.stop(id)
      };
      for (const [channel, handler] of Object.entries(handlers))
        ipcMain.handle(channel, (_event, ...args) => handler(...args));
      const preload = path.join(root, 'preload.cjs');
      buildSync({
        stdin: {
          contents: `import {contextBridge,ipcRenderer} from 'electron';import {createBridge} from './src/preload/createBridge.js';contextBridge.exposeInMainWorld('ipcApi',createBridge(ipcRenderer,'main'));contextBridge.exposeInMainWorld('mpvTestApi',{repair:()=>ipcRenderer.invoke('repair-fixture'),capture:()=>ipcRenderer.invoke('capture-problem-preview')});`,
          resolveDir: path.resolve('.')
        },
        outfile: preload,
        bundle: true,
        platform: 'node',
        format: 'cjs',
        external: ['electron']
      });
      window = new BrowserWindow({
        show: false,
        width: 850,
        height: 400,
        webPreferences: { preload, sandbox: true, backgroundThrottling: false }
      });
      service.on('state', (s) => {
        if (!window.isDestroyed()) window.webContents.send('mpv-state', s);
      });
      const html = path.join(root, 'test.html');
      fs.writeFileSync(html, '<!doctype html><html><body></body></html>');
      await window.loadFile(html);
      await window.webContents.executeJavaScript(`window.mpvFixtures=${JSON.stringify(queue)}`);
      const bundle = buildSync({
        entryPoints: [path.join(__dirname, 'mpvRendererCases.jsx')],
        bundle: true,
        write: false,
        platform: 'browser',
        format: 'iife',
        jsx: 'automatic',
        loader: { '.css': 'text' },
        logOverride: { 'ignored-bare-import': 'silent' },
        define: { 'process.env.NODE_ENV': '"development"' }
      });
      const styles = buildSync({
        stdin: {
          contents: [
            'style/InfiniteList.css',
            'style/TrackProblem.css',
            'style/PlaybackPreferences.css',
            'appstyles/mainThemes.css'
          ]
            .map((f) => `@import './${f}';`)
            .join('\n'),
          loader: 'css',
          resolveDir: path.resolve('src/renderer/src')
        },
        bundle: true,
        write: false
      });
      await window.webContents.executeJavaScript(
        `{const style=document.createElement('style');style.textContent=${JSON.stringify(styles.outputFiles[0].text)};document.head.append(style);}`
      );
      await window.webContents.executeJavaScript(bundle.outputFiles[0].text);
      const results = await window.webContents.executeJavaScript('window.mpvTests');
      results.forEach((r) => console.log(r));
      if (preferences.playbackBackend !== 'mpv') throw Error('Playback backend was not persisted');
      await service.close();
      window.destroy();
      app.exit(0);
    } catch (error) {
      console.error(error);
      await service?.close();
      window?.destroy();
      app.exit(1);
    }
  });
}
