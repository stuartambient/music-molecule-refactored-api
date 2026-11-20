import { ipcMain } from 'electron';
import { is } from '@electron-toolkit/utils';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canRequest } from '../shared/ipcContract.js';
import { validateIpcArguments, validateCatalogAccess, hasIpcValidator } from './ipcValidation.js';

const windows = new WeakMap();
let getCatalog = () => {
  throw new Error('Catalog access is not initialized.');
};
export function configureIpcCatalog(getter) {
  getCatalog = getter;
}
export function rendererEntryUrl(entry) {
  if (is.dev && process.env.ELECTRON_RENDERER_URL)
    return new URL(`${entry}.html`, process.env.ELECTRON_RENDERER_URL.replace(/\/?$/, '/')).href;
  return pathToFileURL(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../renderer', `${entry}.html`)
  ).href;
}
const canonicalUrl = (value) => {
  const url = new URL(value);
  url.hash = '';
  return url.href;
};
export function registerWindowAccess(window, role, url) {
  const sender = window.webContents;
  const record = { role, url: canonicalUrl(url), artwork: new Set() };
  windows.set(sender, record);
  window.once('closed', () => windows.delete(sender));
  window.webContents.on('will-navigate', (event, target) => {
    try {
      if (canonicalUrl(target || event.url) !== record.url) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
}
export function grantArtworkAccess(sender, file) {
  const record = windows.get(sender);
  if (record?.role === 'editor') record.artwork.add(path.resolve(file));
}
export function authorizeIpc(event, direction, channel, args) {
  const sender = event.sender;
  const record = windows.get(sender);
  if (
    !record ||
    sender.isDestroyed() ||
    event.senderFrame !== sender.mainFrame ||
    canonicalUrl(event.senderFrame.url) !== record.url ||
    !canRequest(record.role, direction, channel)
  )
    throw new Error(`This window cannot request ${channel}.`);
  validateIpcArguments(channel, args, record.role);
  validateCatalogAccess(channel, args, record.role, {
    getCatalog,
    artworkAllowed: (file) => record.artwork.has(path.resolve(file))
  });
  return record.role;
}
export const guardedIpc = {
  handle(channel, handler) {
    if (!hasIpcValidator(channel)) throw new Error(`No validator for ${channel}.`);
    ipcMain.handle(channel, (event, ...args) => {
      authorizeIpc(event, 'invoke', channel, args);
      return handler(event, ...args);
    });
  },
  on(channel, handler) {
    if (!hasIpcValidator(channel)) throw new Error(`No validator for ${channel}.`);
    ipcMain.on(channel, (event, ...args) => {
      try {
        authorizeIpc(event, 'send', channel, args);
        Promise.resolve(handler(event, ...args)).catch((error) =>
          console.error(`IPC ${channel} failed:`, error.message)
        );
      } catch (error) {
        console.warn(`IPC ${channel} rejected:`, error.message);
      }
    });
  }
};
