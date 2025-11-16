import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('coverSearchApi', {
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

contextBridge.exposeInMainWorld('coverSearchAltApi', {
  /* onSendToChild: (cb) => ipcRenderer.on('send-to-child', (event, args) => cb(args)),
  notifyReady: () => ipcRenderer.send('child-ready'), */
  /* getTempPath: () => ipcRenderer.invoke('get-temp-path'), */
  /* downloadFile: (fileUrl, savepath, listType) =>
    ipcRenderer.invoke('download-file', fileUrl, savepath, listType), */
  /* onDownloadFile: (cb) => ipcRenderer.on('download-completed', (event, ...args) => cb(args)), */
  /* downloadTagImage: (fileUrl, savepath, listType, delayDownload) =>
    ipcRenderer.invoke('download-tag-image', fileUrl, savepath, listType, delayDownload), */
  /* showContextMenu: (id, itemType) => ipcRenderer.send('show-context-menu', id, itemType), */
  /*  onContextMenuCommand: (callback) => {
    ipcRenderer.on('context-menu-command', (event, command) => callback(command));
  },
  off: (channel, callback) => ipcRenderer.removeListener(channel, callback) */
});
