import { contextBridge, ipcRenderer } from 'electron';

const themeArg = process.argv.find((arg) => arg.startsWith('--theme='));
const initialTheme = themeArg ? themeArg.split('=')[1] : 'light';

contextBridge.exposeInMainWorld('initialTheme', initialTheme);

contextBridge.exposeInMainWorld('tagEditApi', {
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
