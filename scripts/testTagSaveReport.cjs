/* global process, __filename, __dirname, console */
// Run with node scripts/testRendererLifecycle.cjs. Uses a hidden, isolated Electron window.
const { app, BrowserWindow } = require('electron');

if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(require('electron'), [__filename], {
    env,
    stdio: 'inherit',
    windowsHide: true
  });
  if (result.error) console.error(result.error);
  process.exit(result.status ?? 1);
} else {
  const { buildSync } = require('esbuild');
  const { join } = require('node:path');
  const { mkdtempSync, writeFileSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  app.setPath('userData', mkdtempSync(join(tmpdir(), 'music-tag-save-report-')));
  app.disableHardwareAcceleration();
  app.whenReady().then(async () => {
    const window = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, backgroundThrottling: false }
    });
    try {
      const result = buildSync({
        entryPoints: [join(__dirname, 'tagSaveReportCases.jsx')],
        bundle: true,
        write: false,
        platform: 'browser',
        format: 'iife',
        jsx: 'automatic',
        loader: { '.css': 'text' },
        logOverride: { 'ignored-bare-import': 'silent' },
        define: { 'process.env.NODE_ENV': '"development"' }
      });
      const fixtureHtml = join(app.getPath('userData'), 'lifecycle.html');
      writeFileSync(fixtureHtml, '<!doctype html><html><body></body></html>');
      await window.loadFile(fixtureHtml);
      await window.webContents.executeJavaScript(result.outputFiles[0].text);
      const results = await window.webContents.executeJavaScript('window.tagSaveReportTests');
      results.forEach((result) => console.log(result));
      app.exit(0);
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  });
}
