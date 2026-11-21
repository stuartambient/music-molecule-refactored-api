// Run with node scripts/testAlbumControls.cjs. No real preferences or music folders are modified.
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
  const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  app.setPath('userData', mkdtempSync(join(tmpdir(), 'music-molecule-lifecycle-')));
  app.disableHardwareAcceleration();
  app.whenReady().then(async () => {
    const window = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      webPreferences: { sandbox: true, backgroundThrottling: false, offscreen: true }
    });
    try {
      const result = buildSync({
        entryPoints: [join(__dirname, 'albumControlCases.jsx')],
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
            'assets/index.css',
            'App.css',
            'style/InfiniteList.css',
            'style/MediaMenu.css',
            'style/FlashEffect.css',
            'appstyles/mainThemes.css',
            'style/SearchField.css'
          ]
            .map((file) => `@import './${file}';`)
            .join('\n'),
          loader: 'css',
          resolveDir: join(__dirname, '../src/renderer/src')
        },
        bundle: true,
        write: false
      });
      const fixtureHtml = join(app.getPath('userData'), 'albums.html');
      writeFileSync(fixtureHtml, '<!doctype html><html><body></body></html>');
      await window.loadFile(fixtureHtml);
      await window.webContents.executeJavaScript(
        `window.albumCss = ${JSON.stringify(styles.outputFiles[0].text)}`
      );
      await window.webContents.executeJavaScript(result.outputFiles[0].text);
      const results = await window.webContents.executeJavaScript('window.albumTests');
      results.forEach((result) => console.log(result));
      const previewPath = join(__dirname, '../out/album-previews');
      mkdirSync(previewPath, { recursive: true });
      for (const theme of ['basic', 'theme-1']) {
        await window.webContents.executeJavaScript(
          `window.showAlbumPreview(${JSON.stringify(theme)})`
        );
        const screenshot = await window.webContents.capturePage();
        writeFileSync(join(previewPath, `${theme}.png`), screenshot.toPNG());
      }
      console.log('Album control previews saved to out/album-previews.');
      app.exit(0);
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  });
}
