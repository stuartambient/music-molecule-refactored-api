import { contextBridge, ipcRenderer } from 'electron';
import { createBridge } from './createBridge.js';
const role = process.argv.includes('--window-role=tag-cover') ? 'tag-cover' : 'cover';
contextBridge.exposeInMainWorld('coverSearchApi', createBridge(ipcRenderer, role));
