import { useEffect, useState } from 'react';

// A provider's dispatch identifies its list session. Keep cursors through view remounts,
// but discard them when the search, sort, refresh revision, or shuffle mode changes.
const sessions = new WeakMap();
export default function useLibraryPages(
  kind,
  pageNumber,
  term,
  sort,
  resetKey,
  dispatch,
  revision = 0,
  shuffle = false,
  missing = 'not-requested',
  searchField = 'metadata'
) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  useEffect(() => {
    let current = true;
    const key = JSON.stringify([term, sort, resetKey, revision, shuffle, missing, searchField]);
    let lists = sessions.get(dispatch);
    if (!lists) {
      lists = new Map();
      sessions.set(dispatch, lists);
    }
    let session = lists.get(kind);
    if (!session || session.key !== key) {
      session = { key, pages: new Map(), applied: new Set(), requests: new Map() };
      lists.set(kind, session);
    }
    const readPage = (index) => {
      if (session.pages.has(index)) return Promise.resolve(session.pages.get(index));
      if (session.requests.has(index)) return session.requests.get(index);
      const request = (async () => {
        try {
          const previous = index > 0 ? await readPage(index - 1) : null;
          if (previous && previous.nextCursor === null) return { items: [], nextCursor: null };
          let page;
          if (shuffle) {
            if (index === 0) await window.ipcApi.setShuffledTracksArray();
            const items = await window.ipcApi.getShuffledTracks(index);
            page = { items, nextCursor: items.length === 200 ? { shufflePage: index + 1 } : null };
          } else {
            const method = { tracks: 'getTracks', albums: 'getAlbums', covers: 'getCovers' }[kind];
            const args = [previous?.nextCursor || null, term, sort];
            if (kind === 'covers') args.push(missing, searchField);
            if (kind === 'tracks') args.push(searchField);
            page = await window.ipcApi[method](...args);
          }
          if (!page || !Array.isArray(page.items) || !Object.hasOwn(page, 'nextCursor'))
            throw new Error('Invalid library page.');
          // Cache completed responses even if the current view moved on while waiting.
          session.pages.set(index, page);
          return page;
        } finally {
          session.requests.delete(index);
        }
      })();
      session.requests.set(index, request);
      return request;
    };
    setLoading(true);
    setError(false);
    const load = async () => {
      try {
        for (let index = 0; index <= pageNumber; index++) {
          if (session.applied.has(index)) {
            if (index === pageNumber) setHasMore(session.pages.get(index).nextCursor !== null);
            continue;
          }
          const page = await readPage(index);
          if (!current) return;
          const more = page.nextCursor !== null;
          if (!session.applied.has(index)) {
            const type =
              kind === 'tracks'
                ? index === 0
                  ? 'add-tracks'
                  : 'tracks-playlist'
                : kind === 'albums'
                  ? 'albums-playlist'
                  : 'set-covers';
            dispatch({ type, [kind]: page.items, replace: index === 0, hasMore: more, revision });
            session.applied.add(index);
          }
          setHasMore(more);
          if (!more) break;
        }
        setLoading(false);
      } catch (failure) {
        if (!current) return;
        setLoading(false);
        setError(failure.message);
        if (kind === 'tracks')
          dispatch({
            type: 'tracks-load-failed',
            revision,
            error: {
              message:
                'The next library page could not be loaded. Reload the list or select another track.'
            }
          });
      }
    };
    void load();
    return () => {
      current = false;
    };
  }, [kind, pageNumber, term, sort, resetKey, dispatch, revision, shuffle, missing, searchField]);
  return { loading, error, hasMore };
}
