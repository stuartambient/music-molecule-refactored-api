import { BrowserWindow, screen } from 'electron';
import { is } from '@electron-toolkit/utils';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mainWindow, theme } from './index.js';
import { childWindowBounds } from './childWindowBounds.js';
import { guardedIpc, registerWindowAccess, rendererEntryUrl } from './ipcAccess.js';

const windows = new Map();
const preloadDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), '../preload');

function deliverPendingData(entry) {
  if (
    !entry.readyToShow ||
    !entry.rendererReady ||
    !entry.pending ||
    entry.closing ||
    entry.window.isDestroyed()
  )
    return;
  entry.window.webContents.send('send-to-child', entry.data);
  entry.pending = false;
}

// A ready message releases data only for the top-level renderer that sent it.
guardedIpc.on('child-ready', (event) => {
  const entry = [...windows.values()].find(({ window }) => window.webContents === event.sender);
  if (
    !entry ||
    entry.window.isDestroyed() ||
    entry.closing ||
    event.senderFrame !== entry.window.webContents.mainFrame
  )
    return;
  entry.rendererReady = true;
  deliverPendingData(entry);
});

function sendToChild(name, data) {
  const entry = windows.get(name);
  if (!entry || entry.closing || entry.window.isDestroyed()) return false;
  entry.data = data;
  entry.hasData = true;
  entry.pending = true;
  deliverPendingData(entry);
  return true;
}

function createOrUpdateChildWindow(name, type, config, data, opener) {
  const existing = windows.get(name);
  if (existing?.closing && !existing.window.isDestroyed()) {
    return new Promise((resolve) => existing.window.once('closed', resolve)).then(() =>
      createOrUpdateChildWindow(name, type, config, data, opener)
    );
  }
  if (existing && !existing.window.isDestroyed()) {
    if (data !== undefined) sendToChild(name, data);
    if (existing.readyToShow) {
      if (existing.window.isMinimized()) existing.window.restore();
      existing.window.show();
      existing.window.focus();
    }
    return;
  }

  const parent = getWindow(config.parent) || null;
  const origin = parent || opener || mainWindow;
  const bounds =
    origin && !origin.isDestroyed()
      ? childWindowBounds(
          origin.getBounds(),
          config,
          screen.getDisplayMatching(origin.getBounds()).workArea,
          [origin, ...getWindowNames().map(getWindow)].map((window) => window.getBounds())
        )
      : { width: config.width, height: config.height };

  if (!['metadataEditing', 'coverSearchAlt'].includes(config.preload))
    throw new Error('Unknown child preload.');
  const window = new BrowserWindow({
    ...bounds,
    show: config.show,
    parent,
    modal: !!config.parent,
    resizable: config.resizable,
    webPreferences: {
      preload: path.join(preloadDirectory, `${config.preload}.js`),
      additionalArguments: [
        `--theme=${theme}`,
        `--window-role=${config.role || (config.preload === 'metadataEditing' ? 'editor' : 'cover')}`
      ],
      sandbox: true,
      webSecurity: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  registerWindowAccess(
    window,
    config.role || (config.preload === 'metadataEditing' ? 'editor' : 'cover'),
    rendererEntryUrl(config.preload)
  );
  const entry = {
    window,
    readyToShow: false,
    rendererReady: false,
    closing: false,
    data,
    hasData: data !== undefined,
    pending: data !== undefined
  };
  windows.set(name, entry);
  window.removeMenu();
  if (config.preload === 'coverSearchAlt') {
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
  }

  window.webContents.on('did-start-navigation', (event) => {
    if (!event.isMainFrame || event.isSameDocument) return;
    entry.rendererReady = false;
    entry.pending = entry.hasData;
  });
  window.once('ready-to-show', () => {
    if (entry.closing || window.isDestroyed()) return;
    entry.readyToShow = true;
    deliverPendingData(entry);
    window.show();
  });
  window.on('close', () => {
    entry.closing = true;
  });
  window.on('closed', () => {
    if (windows.get(name) !== entry) return;
    windows.delete(name);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-closed', name);
    }
  });

  const loading =
    is.dev && process.env.ELECTRON_RENDERER_URL
      ? window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/${config.preload}.html`)
      : window.loadFile(path.join(preloadDirectory, '../renderer', `${config.preload}.html`));
  loading.catch((error) => console.error('Child window failed to load:', name, error.message));
}

function getWindow(name) {
  const entry = windows.get(name);
  return entry && !entry.closing && !entry.window.isDestroyed() ? entry.window : undefined;
}

function getWindowNames() {
  return [...windows.keys()].filter((name) => getWindow(name));
}

export { createOrUpdateChildWindow, sendToChild, getWindowNames, getWindow };
