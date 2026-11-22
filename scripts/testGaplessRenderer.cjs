/* global process, __filename, __dirname, console, Buffer */
// Uses generated test audio, an isolated profile, and a hidden Chromium window.
const { app, BrowserWindow, protocol } = require('electron');
const { spawnSync } = require('node:child_process');
if (!process.versions.electron) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(require('electron'), [__filename, ...process.argv.slice(2)], {
    env,
    stdio: 'inherit',
    windowsHide: true
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
} else {
  const { buildSync } = require('esbuild');
  const { join } = require('node:path');
  const fs = require('node:fs');
  const { tmpdir } = require('node:os');
  const fixtureRoot = fs.mkdtempSync(join(tmpdir(), 'music-gapless-'));
  app.setPath('userData', join(fixtureRoot, 'profile'));
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'streaming',
      privileges: {
        stream: true,
        standard: true,
        bypassCSP: true,
        supportFetchAPI: true,
        corsEnabled: true
      }
    }
  ]);
  function wav(segment, frames = 24000) {
    const bytes = Buffer.alloc(44 + frames * 2);
    bytes.write('RIFF', 0);
    bytes.writeUInt32LE(bytes.length - 8, 4);
    bytes.write('WAVEfmt ', 8);
    bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20);
    bytes.writeUInt16LE(1, 22);
    bytes.writeUInt32LE(48000, 24);
    bytes.writeUInt32LE(96000, 28);
    bytes.writeUInt16LE(2, 32);
    bytes.writeUInt16LE(16, 34);
    bytes.write('data', 36);
    bytes.writeUInt32LE(bytes.length - 44, 40);
    for (let i = 0; i < frames; i++)
      bytes.writeInt16LE(
        Math.round(12000 * Math.sin(((segment * frames + i) * 2 * Math.PI * 440) / 48000)),
        44 + i * 2
      );
    return bytes;
  }
  app.whenReady().then(async () => {
    let window;
    try {
      const fixtures = { flac: [], mp3: [] };
      for (let i = 0; i < 2; i++) {
        const input = join(fixtureRoot, `${i}.wav`);
        fs.writeFileSync(input, wav(i));
        for (const format of ['flac', 'mp3']) {
          const output = join(fixtureRoot, `${i}.${format}`);
          const result = spawnSync(
            'ffmpeg',
            [
              '-hide_banner',
              '-loglevel',
              'error',
              '-y',
              '-i',
              input,
              ...(format === 'mp3' ? ['-c:a', 'libmp3lame', '-q:a', '2'] : ['-c:a', 'flac']),
              output
            ],
            { encoding: 'utf8', windowsHide: true }
          );
          if (result.error || result.status !== 0)
            throw new Error(result.error?.message || result.stderr);
          fixtures[format].push({
            track_id: `${format}-${i}`,
            audiotrack: output.replaceAll('\\', '/'),
            title: `Continuous segment ${i + 1}`
          });
        }
      }
      fixtures.playlist = [];
      for (let i = 0; i < 2; i++) {
        const input = join(fixtureRoot, `long-${i}.wav`);
        const output = join(fixtureRoot, `long-${i}.flac`);
        fs.writeFileSync(input, wav(i, 144000));
        const result = spawnSync(
          'ffmpeg',
          ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-c:a', 'flac', output],
          { encoding: 'utf8', windowsHide: true }
        );
        if (result.error || result.status !== 0)
          throw new Error(result.error?.message || result.stderr);
        fixtures.playlist.push({
          track_id: `long-${i}`,
          audiotrack: output.replaceAll('\\', '/'),
          title: `Continuous Playlist segment ${i + 1}`
        });
      }
      const realTracksFlag = process.argv.indexOf('--tracks-file');
      if (realTracksFlag >= 0)
        fixtures.real = JSON.parse(fs.readFileSync(process.argv[realTracksFlag + 1], 'utf8'));
      const approvedRealPaths = new Set(
        (fixtures.real || []).map((track) => track.audiotrack.toLowerCase())
      );
      protocol.registerStreamProtocol('streaming', (request, callback) => {
        const location = decodeURIComponent(request.url.split('?')[0]).replace('streaming://', '');
        const path = location.charAt(0).toUpperCase() + ':' + location.slice(1);
        if (
          !approvedRealPaths.has(path.toLowerCase()) &&
          !path.toLowerCase().startsWith(fixtureRoot.replaceAll('\\', '/').toLowerCase() + '/')
        )
          return callback({ statusCode: 403 });
        callback({
          statusCode: 200,
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Length': String(fs.statSync(path).size),
            'Access-Control-Allow-Origin': '*'
          },
          data: fs.createReadStream(path)
        });
      });
      window = new BrowserWindow({
        width: 800,
        height: 240,
        show: false,
        webPreferences: { sandbox: true, offscreen: true, backgroundThrottling: false }
      });
      const bundle = buildSync({
        entryPoints: [join(__dirname, 'gaplessRendererCases.jsx')],
        bundle: true,
        write: false,
        platform: 'browser',
        format: 'iife',
        jsx: 'automatic',
        loader: { '.css': 'text', '.jpg': 'dataurl' },
        logOverride: { 'ignored-bare-import': 'silent' },
        define: { 'process.env.NODE_ENV': '"development"' }
      });
      const styles = buildSync({
        stdin: {
          contents: [
            'assets/index.css',
            'App.css',
            'style/MediaMenu.css',
            'style/GaplessToggle.css',
            'style/Home.css',
            'style/SearchField.css',
            'style/AlbumsCoverView.css',

            'appstyles/mainThemes.css'
          ]
            .map((file) => `@import './${file}';`)
            .join('\n'),
          loader: 'css',
          resolveDir: join(__dirname, '../src/renderer/src')
        },
        bundle: true,
        write: false
      });
      const html = join(fixtureRoot, 'test.html');
      fs.writeFileSync(
        html,
        "<!doctype html><html><head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'; connect-src 'self' streaming:; media-src 'self' streaming:; style-src 'self' 'unsafe-inline';\"></head><body></body></html>"
      );
      await window.loadFile(html);
      await window.webContents.executeJavaScript(
        `window.gaplessFixtures=${JSON.stringify(fixtures)};window.gaplessCss=${JSON.stringify(styles.outputFiles[0].text)};`
      );
      await window.webContents.executeJavaScript(bundle.outputFiles[0].text);
      const results = await window.webContents.executeJavaScript(
        'window.gaplessTests.catch(error => { console.error(error.stack); throw error; })'
      );
      results.forEach((result) => console.log(result));
      const previews = join(__dirname, '../out/gapless-previews');
      fs.mkdirSync(previews, { recursive: true });
      for (const [theme, mini] of [
        ['basic', false],
        ['theme-1', false],
        ['basic', true]
      ]) {
        await window.webContents.executeJavaScript(
          `window.gaplessPreview(${JSON.stringify(theme)},${mini})`
        );
        fs.writeFileSync(
          join(previews, `${theme}${mini ? '-mini' : ''}.png`),
          (await window.webContents.capturePage()).toPNG()
        );
      }
      for (const theme of ['basic', 'theme-1']) {
        await window.webContents.executeJavaScript(
          `window.gaplessPreview(${JSON.stringify(theme)},false,true)`
        );
        fs.writeFileSync(
          join(previews, `covers-${theme}.png`),
          (await window.webContents.capturePage()).toPNG()
        );
      }
      await window.webContents.executeJavaScript('window.disposeGaplessPreview()');
      app.exit(0);
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  });
}
