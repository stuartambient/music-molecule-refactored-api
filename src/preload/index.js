import { contextBridge, ipcRenderer } from 'electron';
import { createBridge } from './createBridge.js';
const argument = process.argv.find((arg) => arg.startsWith('--mainTheme='));
contextBridge.exposeInMainWorld(
  'initialMainTheme',
  argument ? argument.slice('--mainTheme='.length) : 'basic'
);
const role = process.argv.includes('--window-role=recovery') ? 'recovery' : 'main';
contextBridge.exposeInMainWorld('ipcApi', createBridge(ipcRenderer, role));
