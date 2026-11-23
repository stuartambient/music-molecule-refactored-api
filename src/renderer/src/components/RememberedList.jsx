import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';

export default function RememberedList({
  memory,
  memoryKey,
  targetIndex = -1,
  targetTrackId,
  onRestore,
  ...props
}) {
  const handle = useRef(null);
  const scroller = useRef(null);
  const [scrollElement, setScrollElement] = useState(null);
  const attachScroller = useCallback((element) => {
    scroller.current = element;
    setScrollElement(element);
  }, []);
  // Keep the mount snapshot fixed while Virtuoso measures and restores it.
  const [destination] = useState(() => ({ targetIndex, targetTrackId, onRestore }));
  const [restore] = useState(() =>
    targetIndex < 0 && memory.current?.key === memoryKey ? memory.current.snapshot : undefined
  );
  useEffect(() => {
    if (destination.targetIndex < 0) return;
    destination.onRestore?.();
    const element = scrollElement;
    if (!element || !destination.targetTrackId) return;
    let frame;
    let done = false;
    const locate = () => {
      if (done) return;
      const row = [...element.querySelectorAll('[data-track-id]')].find(
        (node) => node.dataset.trackId === String(destination.targetTrackId)
      );
      if (!row) return;
      cancelAnimationFrame(frame);
      // Wait for Virtuoso to measure the newly unfolded album before centering its track.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          // Initial positioning can still override scrollTop while Virtuoso hides its rows.
          if (!row.isConnected || getComputedStyle(row).visibility === 'hidden') {
            frame = requestAnimationFrame(locate);
            return;
          }
          element.scrollTop +=
            row.getBoundingClientRect().top -
            element.getBoundingClientRect().top -
            (element.clientHeight - row.offsetHeight) / 2;
          done = true;
          observer.disconnect();
        });
      });
    };
    const observer = new MutationObserver(locate);
    observer.observe(element, { childList: true, subtree: true });
    locate();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [destination, scrollElement]);
  const save = useCallback(() => {
    const element = scroller.current;
    if (!handle.current || !element || !element.clientHeight) return;
    const scrollTop = element.scrollTop;
    handle.current.getState((snapshot) => {
      if (snapshot.ranges.length)
        memory.current = { key: memoryKey, snapshot: { ...snapshot, scrollTop } };
    });
  }, [memory, memoryKey]);
  useLayoutEffect(() => () => save(), [save]);
  return (
    <Virtuoso
      {...props}
      ref={handle}
      restoreStateFrom={restore}
      initialTopMostItemIndex={
        destination.targetIndex >= 0 ? { index: destination.targetIndex, align: 'start' } : 0
      }
      scrollerRef={attachScroller}
      onScroll={save}
      rangeChanged={save}
    />
  );
}
