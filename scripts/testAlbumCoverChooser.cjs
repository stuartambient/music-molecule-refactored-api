/* global __filename, __dirname */
const process = require('node:process');
const console = require('node:console');
const assert = require('node:assert/strict');
const { Response } = globalThis;
// Isolated renderer test: mock IPC, synthetic thumbnails, disposable user data.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process');
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'music-album-cover-ui-'));
  assert.equal(path.dirname(temporaryRoot), os.tmpdir());
  assert.ok(path.basename(temporaryRoot).startsWith('music-album-cover-ui-'));
  try {
    const env = { ...process.env, COVER_CHOOSER_TEST_ROOT: temporaryRoot };
    delete env.ELECTRON_RUN_AS_NODE;
    const result = spawnSync(require('electron'), [__filename, ...process.argv.slice(2)], {
      env,
      stdio: 'inherit',
      windowsHide: true,
      timeout: 60000
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
} else {
  const { app, BrowserWindow, protocol } = require('electron');
  const { buildSync } = require('esbuild');
  app.setPath('userData', process.env.COVER_CHOOSER_TEST_ROOT);
  app.disableHardwareAcceleration();
  app.whenReady().then(async () => {
    const win = new BrowserWindow({
      width: 1040,
      height: 760,
      show: false,
      webPreferences: { sandbox: true, backgroundThrottling: false }
    });
    try {
      protocol.handle('cover', (request) => {
        const label = request.url.includes('front')
          ? 'FRONT'
          : request.url.includes('back')
            ? 'BACK'
            : request.url.includes('spectrogram')
              ? 'SPECTROGRAM'
              : 'ALTERNATE';
        const color = label === 'FRONT' ? '#315e70' : label === 'BACK' ? '#695245' : '#3b435b';
        return new Response(
          `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="${color}"/><circle cx="150" cy="125" r="70" fill="#ffffff18"/><text x="150" y="240" text-anchor="middle" font-size="22" fill="white">${label}</text></svg>`,
          { headers: { 'Content-Type': 'image/svg+xml' } }
        );
      });
      const result = buildSync({
        entryPoints: [path.join(__dirname, 'albumCoverChooserCases.jsx')],
        bundle: true,
        write: false,
        outfile: 'test.js',
        platform: 'browser',
        format: 'iife',
        jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"development"' }
      });
      const theme = buildSync({
        entryPoints: [path.join(__dirname, '../src/renderer/src/appstyles/mainThemes.css')],
        bundle: true,
        write: false
      });
      // Also compile the real Covers view, including its chooser/menu integration.
      buildSync({
        entryPoints: [path.join(__dirname, '../src/renderer/src/components/AlbumsCoverView.jsx')],
        bundle: true,
        write: false,
        platform: 'browser',
        jsx: 'automatic',
        loader: { '.css': 'empty', '.jpg': 'dataurl' }
      });
      await win.loadURL('about:blank');
      const css =
        theme.outputFiles[0].text +
        result.outputFiles.find((file) => file.path.endsWith('.css')).text +
        'body { font-family: system-ui; background: #182028; }';
      await win.webContents.executeJavaScript(
        `document.head.append(Object.assign(document.createElement('style'), { textContent: ${JSON.stringify(css)} }));`
      );
      await win.webContents.executeJavaScript(
        result.outputFiles.find((file) => file.path.endsWith('.js')).text
      );
      const results = await win.webContents.executeJavaScript('window.chooserTests');
      results.forEach((result) => console.log(result));
      const at = process.argv.indexOf('--screenshot');
      if (at >= 0) {
        const output = process.argv[at + 1];
        for (const themeName of ['basic', 'theme-1']) {
          await win.webContents.executeJavaScript(
            `window.showCoverTheme(${JSON.stringify(themeName)}); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));`
          );
          const screenshot = await win.webContents.capturePage();
          fs.writeFileSync(output.replace('.png', `-${themeName}.png`), screenshot.toPNG());
        }
      }
      win.destroy();
      app.exit(0);
    } catch (error) {
      console.error(error);
      win.destroy();
      app.exit(1);
    }
  });
}
