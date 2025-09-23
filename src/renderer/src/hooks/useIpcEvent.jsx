// hooks/useIpcEvent.js
import { useEffect, useRef } from 'react';

export default function useIpcEvent(channel, handler) {
  /*   console.log('channel: ', channel, 'handler: ', handler); */
  const handlerRef = useRef(handler);

  // Always keep the ref updated with the latest handler
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!channel) return;
    const cleanup = window.ipcApi.on(channel, (...args) => handlerRef.current?.(...args));
    return cleanup; // <-- crucial
  }, [channel]);
}
