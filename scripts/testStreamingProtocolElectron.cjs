/* global __filename, __dirname */
const process = require('node:process');
const console = require('node:console');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Buffer } = require('node:buffer');
const { pathToFileURL } = require('node:url');
if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'music-streaming-electron-'));
  assert.equal(path.dirname(root), os.tmpdir());
  assert.ok(path.basename(root).startsWith('music-streaming-electron-'));
  try {
    const env = { ...process.env, STREAMING_TEST_ROOT: root };
    delete env.ELECTRON_RUN_AS_NODE;
    const result = spawnSync(require('electron'), [__filename], {
      env,
      stdio: 'inherit',
      windowsHide: true,
      timeout: 60000
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
} else {
  const { app, BrowserWindow, protocol } = require('electron');
  const root = process.env.STREAMING_TEST_ROOT;
  const profile = path.join(root, 'profile');
  fs.mkdirSync(profile);
  app.setPath('userData', profile);
  app.disableHardwareAcceleration();
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'streaming',
      privileges: {
        standard: true,
        stream: true,
        bypassCSP: true,
        supportFetchAPI: true,
        corsEnabled: true
      }
    }
  ]);
  app.whenReady().then(async () => {
    let win;
    try {
      const { createStreamingHandler } = await import(
        pathToFileURL(path.join(__dirname, '../src/main/streamingProtocol.js')).href
      );
      const { streamingUrl } = await import(
        pathToFileURL(path.join(__dirname, '../src/shared/streamingUrl.js')).href
      );
      const bytes = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz');
      const file = path.join(root, '50% # é literal%2F.flac');
      fs.writeFileSync(file, bytes);
      const large = path.join(root, 'large.flac');
      fs.writeFileSync(large, Buffer.alloc(4 * 1024 * 1024, 5));
      const wav = path.join(root, 'silent preview.wav');
      const sampleRate = 44100,
        seconds = 3,
        dataSize = sampleRate * seconds * 2;
      const audio = Buffer.alloc(44 + dataSize);
      audio.write('RIFF');
      audio.writeUInt32LE(audio.length - 8, 4);
      audio.write('WAVEfmt ', 8);
      audio.writeUInt32LE(16, 16);
      audio.writeUInt16LE(1, 20);
      audio.writeUInt16LE(1, 22);
      audio.writeUInt32LE(sampleRate, 24);
      audio.writeUInt32LE(sampleRate * 2, 28);
      audio.writeUInt16LE(2, 32);
      audio.writeUInt16LE(16, 34);
      audio.write('data', 36);
      audio.writeUInt32LE(dataSize, 40);
      fs.writeFileSync(wav, audio);
      let live = 0;
      protocol.handle(
        'streaming',
        createStreamingHandler({
          open: async (...args) => {
            const file = await fs.promises.open(...args);
            live++;
            file.once('close', () => {
              live--;
            });
            return file;
          },
          onError: (error) => console.error('Unexpected stream error:', error.message)
        })
      );
      win = new BrowserWindow({
        show: false,
        webPreferences: { sandbox: true, backgroundThrottling: false }
      });
      await win.loadURL('about:blank');
      const fixtures = {
        url: streamingUrl(file),
        large: streamingUrl(large),
        wav: streamingUrl(wav),
        legacy: 'streaming://' + encodeURI(wav.replaceAll('\\', '/')),
        missing: streamingUrl(path.join(root, 'missing.flac'))
      };
      await win.webContents.executeJavaScript(
        `window.streamingFixtures = ${JSON.stringify(fixtures)};`
      );
      const results = await win.webContents.executeJavaScript(`(async () => {
        const assert = (value, message) => { if (!value) throw new Error(message); };
        const f = window.streamingFixtures, results = [];
        const full = await fetch(f.url); assert(full.status === 200, 'Full fetch failed'); assert(full.headers.get('content-type') === 'audio/flac', 'Wrong FLAC MIME'); assert(await full.text() === '0123456789abcdefghijklmnopqrstuvwxyz', 'Encoded filename read wrong bytes'); results.push('PASS Chromium fetch and encoded filename');
        const part = await fetch(f.url, { headers: { Range: 'bytes=2-5' } }); assert(part.status === 206 && await part.text() === '2345', 'Range fetch failed');
        const suffix = await fetch(f.url, { headers: { Range: 'bytes=-4' } }); assert(suffix.status === 206 && await suffix.text() === 'wxyz', 'Suffix fetch failed');
        const invalid = await fetch(f.url, { headers: { Range: 'bytes=99-' } }); assert(invalid.status === 416, 'Invalid range was accepted'); results.push('PASS Chromium explicit and suffix ranges');
        const head = await fetch(f.url, { method: 'HEAD' }); assert(head.status === 200 && (await head.arrayBuffer()).byteLength === 0, 'HEAD failed');
        const missing = await fetch(f.missing); assert(missing.status === 404, 'Missing source did not return 404'); results.push('PASS HEAD and missing file');
        const legacy = await fetch(f.legacy); assert(legacy.ok, 'Legacy drive-host URL failed'); await legacy.arrayBuffer(); results.push('PASS existing URL compatibility');
        const big = await fetch(f.large); const reader = big.body.getReader(); await reader.read(); await reader.cancel(); results.push('PASS Chromium body cancellation');
        const element = document.createElement('audio'); element.muted = true; document.body.append(element);
        await new Promise((resolve, reject) => { element.onloadedmetadata = resolve; element.onerror = () => reject(new Error('Audio metadata failed')); element.src = f.wav; });
        assert(Math.abs(element.duration - 3) < .05, 'Audio duration incorrect');
        await new Promise((resolve, reject) => { element.onseeked = resolve; element.onerror = () => reject(new Error('Audio seek failed')); element.currentTime = 1.5; });
        assert(Math.abs(element.currentTime - 1.5) < .1, 'Audio seek position incorrect'); element.removeAttribute('src'); element.load(); element.remove(); results.push('PASS HTML audio metadata and seek');
        const context = new AudioContext();
        try { const response = await fetch(f.wav); const decoded = await context.decodeAudioData(await response.arrayBuffer()); assert(Math.abs(decoded.duration - 3) < .05, 'Web Audio duration incorrect'); }
        finally { await context.close(); }
        results.push('PASS Web Audio decode for buffered gapless playback'); return results;
      })()`);
      results.forEach((result) => console.log(result));
      win.destroy();
      win = null;
      for (let attempt = 0; live && attempt < 100; attempt++)
        await new Promise((resolve) => require('node:timers').setTimeout(resolve, 10));
      assert.equal(live, 0, 'Descriptor left open after playback/cancellation');
      console.log('PASS all protocol file handles closed');
      protocol.unhandle('streaming');
      app.exit(0);
    } catch (error) {
      console.error(error);
      win?.destroy();
      app.exit(1);
    }
  });
}
