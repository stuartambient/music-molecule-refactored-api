// Run with node scripts/testSettingsPage.cjs. No real preferences or music folders are modified.
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
        entryPoints: [join(__dirname, 'settingsPageCases.jsx')],
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
            'style/MainNav.css',
            'style/NativeDragDropFolderInput.css',
            'style/Update.css',
            'style/MainPreferences.css',
            'style/PlaybackPreferences.css',
            'style/ScheduleForm.css',
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
      await window.loadURL('about:blank');
      await window.webContents.executeJavaScript(
        `window.settingsCss = ${JSON.stringify(styles.outputFiles[0].text)}`
      );
      await window.webContents.executeJavaScript(result.outputFiles[0].text);
      const results = await window.webContents.executeJavaScript('window.settingsTests');
      results.forEach((result) => console.log(result));
      const previewPath = join(app.getPath('userData'), 'settings-previews');
      mkdirSync(previewPath, { recursive: true });
      for (const theme of ['basic', 'theme-1']) {
        await window.webContents.executeJavaScript(
          `window.showSettingsPreview(${JSON.stringify(theme)})`
        );
        const screenshot = await window.webContents.capturePage();
        writeFileSync(join(previewPath, `${theme}-folders.png`), screenshot.toPNG());
        await window.webContents.executeJavaScript('window.showSettingsSection("playback")');
        writeFileSync(
          join(previewPath, `${theme}-playback.png`),
          (await window.webContents.capturePage()).toPNG()
        );
        await window.webContents.executeJavaScript('window.showSettingsSection("preferences")');
        const themeScreenshot = await window.webContents.capturePage();
        writeFileSync(join(previewPath, `${theme}-themes.png`), themeScreenshot.toPNG());
      }
      window.setContentSize(500, 640);
      await window.webContents.executeJavaScript('window.checkSettingsLayout()');
      const narrow = await window.webContents.capturePage();
      writeFileSync(join(previewPath, 'narrow.png'), narrow.toPNG());
      console.log('Settings previews saved to the temporary test profile.');
      app.exit(0);
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  });
}
