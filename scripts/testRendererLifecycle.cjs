/* global process, __filename, __dirname, console */
// Run with node scripts/testRendererLifecycle.cjs. Uses a hidden, isolated Electron window.
const { app, BrowserWindow } = require('electron');

if (!process.versions.electron) {
  const { spawnSync } = require('node:child_process');
  const fs = require('node:fs');
  const path = require('node:path');
  const os = require('node:os');
  const assert = require('node:assert/strict');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'music-preview-lifecycle-'));
  assert.equal(path.dirname(temporary), os.tmpdir());
  assert.ok(path.basename(temporary).startsWith('music-preview-lifecycle-'));
  try {
    const env = { ...process.env, LIFECYCLE_TEST_ROOT: temporary };
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
    fs.rmSync(temporary, { recursive: true, force: true });
  }
} else {
  const { buildSync } = require('esbuild');
  const { join } = require('node:path');
  const { writeFileSync } = require('node:fs');
  app.setPath('userData', process.env.LIFECYCLE_TEST_ROOT);
  app.disableHardwareAcceleration();
  app.whenReady().then(async () => {
    const window = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, backgroundThrottling: false }
    });
    try {
      const result = buildSync({
        entryPoints: [join(__dirname, 'rendererLifecycleCases.jsx')],
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
      const results = await window.webContents.executeJavaScript('window.lifecycleTests');
      results.forEach((result) => console.log(result));
      app.exit(0);
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  });
}
