// hooks/useIpcEvent.js
import { useEffect, useEffectEvent } from 'react';

/**
 * React hook to subscribe to an IPC event in any renderer.
 *
 * @param {string} channel - IPC channel name
 * @param {Function} handler - Callback when event fires
 * @param {string} [apiKey='ipcApi'] - Which preload API to use (default = 'ipcApi')
 */

export default function useIpcEvent(channel, handler, apiKey = 'ipcApi') {
  /*   console.log('channel: ', channel, 'handler: ', handler); */
  /* const handlerRef = useRef(handler); */
  const stableHandler = useEffectEvent(handler);

  // Always keep the ref updated with the latest handler
  /*   useEffect(() => {
    handlerRef.current = handler;
  }, [handler]); */

  /*   useEffect(() => {
    if (!channel) return;
    const cleanup = window.ipcApi.on(channel, (...args) => handlerRef.current?.(...args));
    return cleanup; 
  }, [channel]);
 */
  useEffect(() => {
    if (!channel) return;

    const api = window[apiKey];
    if (!api?.on) {
      console.warn(`useIpcEvent: '${apiKey}' does not exist or has no 'on' method`);
      return;
    }

    /* const cleanup = api.on(channel, (...args) => handlerRef.current?.(...args)); */
    const cleanup = api.on(channel, stableHandler);
    return cleanup; // remove listener on unmount
  }, [channel, stableHandler, apiKey]);
}
