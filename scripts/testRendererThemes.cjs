// Run with node scripts/testRendererThemes.cjs. Uses mocked IPC in an isolated Electron window.
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
      width: 1280,
      height: 850,
      show: false,
      webPreferences: { sandbox: true, backgroundThrottling: false }
    });
    try {
      const result = buildSync({
        entryPoints: [join(__dirname, 'rendererThemeCases.jsx')],
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
            'components/ChildWindows/metadataEditingWindow/style.css',
            'components/table/styles/CustomToolPanel.css',
            'components/table/styles/TableAudioControls.css',
            'components/table/styles/CustomSlider.css',
            'components/table/styles/EditForm.css',
            'components/table/styles/AGGrid.css',
            'components/table/styles/PlayButtonRenderer.css',
            'style/Modal.css',
            'appstyles/mainThemes.css',
            'themes.css'
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
        `window.themeCss = ${JSON.stringify(styles.outputFiles[0].text)}`
      );
      await window.webContents.executeJavaScript(result.outputFiles[0].text);
      const results = await window.webContents.executeJavaScript('window.themeTests');
      results.forEach((result) => console.log(result));
      const previewPath = join(__dirname, '../out/theme-previews');
      mkdirSync(previewPath, { recursive: true });
      for (const theme of ['basic', 'theme-1']) {
        await window.webContents.executeJavaScript(
          `window.showThemePreview(${JSON.stringify(theme)})`
        );
        const screenshot = await window.webContents.capturePage();
        writeFileSync(join(previewPath, `${theme}.png`), screenshot.toPNG());
      }
      console.log('Theme previews saved to out/theme-previews.');
      app.exit(0);
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  });
}
