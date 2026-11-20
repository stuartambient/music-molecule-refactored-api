import { contextBridge, ipcRenderer } from 'electron';
import { createBridge } from './createBridge.js';
const argument = process.argv.find((arg) => arg.startsWith('--theme='));
contextBridge.exposeInMainWorld(
  'initialTheme',
  argument ? argument.slice('--theme='.length) : 'light'
);
contextBridge.exposeInMainWorld('tagEditApi', createBridge(ipcRenderer, 'editor'));
