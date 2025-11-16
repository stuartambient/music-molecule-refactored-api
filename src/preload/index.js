import { contextBridge, ipcRenderer } from 'electron';

const mainThemeArg = process.argv.find((arg) => arg.startsWith('--mainTheme='));
const initialMainTheme = mainThemeArg ? mainThemeArg.split('=')[1] : 'basic';

contextBridge.exposeInMainWorld('initialMainTheme', initialMainTheme);

contextBridge.exposeInMainWorld('ipcApi', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  on: (channel, listener) => {
    /*     ipcRenderer.on(channel, (event, ...args) => listener(...args));
    console.log('listener added for', channel, ipcRenderer.listenerCount(channel)); */

    const wrapped = (event, ...args) => listener(...args);
    ipcRenderer.on(channel, wrapped);
    /* console.log('listener added for', channel, ipcRenderer.listenerCount(channel)); */
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
  once: (channel, listener) => {
    ipcRenderer.once(channel, (event, ...args) => listener(...args));
  },
  off: (channel, listener) => ipcRenderer.removeListener(channel, listener)
});

