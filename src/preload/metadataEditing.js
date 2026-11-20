import { contextBridge, ipcRenderer } from 'electron';
import { createBridge } from './createBridge.js';
import { normalizeMainTheme, normalizeEditorTheme } from '../shared/themePreferences.js';
const launchArgument = (name) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
contextBridge.exposeInMainWorld(
  'initialMainTheme',
  normalizeMainTheme(launchArgument('mainTheme'))
);
contextBridge.exposeInMainWorld(
  'initialEditorTheme',
  normalizeEditorTheme(launchArgument('editorTheme'))
);
const argument = process.argv.find((arg) => arg.startsWith('--theme='));
contextBridge.exposeInMainWorld(
  'initialTheme',
  argument ? argument.slice('--theme='.length) : 'light'
);
contextBridge.exposeInMainWorld('tagEditApi', createBridge(ipcRenderer, 'editor'));
