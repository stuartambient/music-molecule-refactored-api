import { BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { is } from '@electron-toolkit/utils';

export async function createStartupWindow() {
  const window = new BrowserWindow({
    width: 400,
    height: 260,
    frame: false,
    show: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    backgroundColor: '#142530',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const painted = new Promise((resolve, reject) => {
    window.once('ready-to-show', resolve);
    window.once('closed', () => {
      const error = new Error('Startup was cancelled.');
      error.name = 'StartupCancelled';
      reject(error);
    });
  });
  const directory = path.dirname(fileURLToPath(import.meta.url));
  try {
    const loading =
      is.dev && process.env.ELECTRON_RENDERER_URL
        ? window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/splash.html`)
        : window.loadFile(path.join(directory, '../renderer/splash.html'));
    await Promise.all([painted, loading]);
    window.show();
    // Give the renderer a visible frame before synchronous database checks begin.
    await window.webContents.executeJavaScript(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
    );
    return window;
  } catch (error) {
    if (window.isDestroyed()) error.name = 'StartupCancelled';
    else window.destroy();
    throw error;
  }
}
