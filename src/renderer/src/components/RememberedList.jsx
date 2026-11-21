import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';

export default function RememberedList({ memory, memoryKey, ...props }) {
  const handle = useRef(null);
  const scroller = useRef(null);
  // Keep the mount snapshot fixed while Virtuoso measures and restores it.
  const [restore] = useState(() =>
    memory.current?.key === memoryKey ? memory.current.snapshot : undefined
  );
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
      scrollerRef={(element) => {
        scroller.current = element;
      }}
      onScroll={save}
      rangeChanged={save}
    />
  );
}
