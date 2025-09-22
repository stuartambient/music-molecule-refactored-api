// hooks/useIpcEvent.js
import { useEffect, useRef } from 'react';

export default function useIpcEvent(channel, handler) {
  console.log('channel: ', channel, 'handler: ', handler);
  const handlerRef = useRef(handler);

  // Always keep the ref updated with the latest handler
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!channel) return;

    const listener = (...args) => {
      // Call whatever handler is currently in the ref
      handlerRef.current?.(...args);
    };

    window.ipcApi.on(channel, listener);
    return () => {
      window.ipcApi.off(channel, listener);
    };
  }, [channel]);
}
