import { ipcContracts } from '../shared/ipcContract.js';

export function createBridge(ipcRenderer, role) {
  const contract = ipcContracts[role];
  if (!contract) throw new Error('Unknown window role.');
  const api = {};
  for (const [method, channel] of Object.entries(contract.invoke))
    api[method] = (...args) => ipcRenderer.invoke(channel, ...args);
  for (const [method, channel] of Object.entries(contract.send))
    api[method] = (...args) => ipcRenderer.send(channel, ...args);
  const listeners = new Map();
  const subscribe = (channel, listener, once) => {
    if (!contract.events.includes(channel) || typeof listener !== 'function')
      throw new Error('This event subscription is not permitted.');
    const wrapped = (_event, ...args) => {
      if (once) cleanup();
      listener(...args);
    };
    const cleanup = () => {
      ipcRenderer.removeListener(channel, wrapped);
      const byListener = listeners.get(channel);
      const subscriptions = byListener?.get(listener);
      subscriptions?.delete(cleanup);
      if (subscriptions?.size === 0) byListener.delete(listener);
      if (byListener?.size === 0) listeners.delete(channel);
    };
    if (!listeners.has(channel)) listeners.set(channel, new Map());
    if (!listeners.get(channel).has(listener)) listeners.get(channel).set(listener, new Set());
    listeners.get(channel).get(listener).add(cleanup);
    ipcRenderer.on(channel, wrapped);
    return cleanup;
  };
  api.on = (channel, listener) => subscribe(channel, listener, false);
  api.once = (channel, listener) => subscribe(channel, listener, true);
  api.off = (channel, listener) => {
    if (!contract.events.includes(channel))
      throw new Error('This event subscription is not permitted.');
    for (const cleanup of [...(listeners.get(channel)?.get(listener) || [])]) cleanup();
  };
  return Object.freeze(api);
}
