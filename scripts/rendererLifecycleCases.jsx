import { testPlaybackPositions } from './playbackPositionCases';
import React, { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { AudioProvider } from '../src/renderer/src/components/table/AudioProvider';
import Player from '../src/renderer/src/components/Player';
import { MainAudioContext } from '../src/renderer/src/mainAudioContext';
import playerStyles from '../src/renderer/src/style/Player.css';
import {
  useAlbums,
  useAllAlbumsCovers,
  useTracks,
  useDistinctDirectories
} from '../src/renderer/src/hooks/useDb';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const mount = () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  return {
    render: (element) =>
      act(async () => {
        root.render(element);
      }),
    async dispose() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  };
};

window.lifecycleTests = (async () => {
  const results = await testPlaybackPositions();
  {
    const style = document.createElement('style');
    style.textContent = playerStyles;
    document.head.append(style);
    const view = mount();
    let opens = 0;
    const dispatch = () => {};
    for (const library of [false, true]) {
      const state = {
        minimalmode: true,
        minimalmodeInfo: false,
        miniModePlaylist: library,
        library,
        cover: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
        mainTheme: 'basic',
        duration: '',
        home: false
      };
      const render = (cover) =>
        view.render(
          <MainAudioContext.Provider value={{ state: { ...state, cover }, dispatch }}>
            <Player
              onExpandArtwork={() => {
                opens++;
              }}
            />
          </MainAudioContext.Provider>
        );
      await render(state.cover);
      const player = document.querySelector('.audio-player');
      player.style.width = '290px';
      player.style.height = '300px';
      const button = player.querySelector('button[aria-label="Expand album artwork"]');
      assert(button, 'Mini-mode artwork expand button is missing');
      const bounds = player.getBoundingClientRect(),
        hit = button.getBoundingClientRect();
      assert(hit.width >= 32 && hit.height >= 32, 'Mini expand target is too small');
      assert(
        hit.left >= bounds.left && hit.right <= bounds.right && hit.top >= bounds.top,
        'Mini expand button is outside the player'
      );
      assert(
        getComputedStyle(button).webkitAppRegion === 'no-drag',
        'Mini expand button is a window drag region'
      );
      button.focus();
      assert(document.activeElement === button, 'Mini expand button cannot receive keyboard focus');
      await act(async () => {
        button.click();
      });
      for (const cover of ['', 'not available']) {
        await render(cover);
        assert(
          !document.querySelector('.artwork-expand--mini'),
          'Mini expand button remains without artwork'
        );
      }
    }
    assert(opens === 2, 'Mini expand buttons did not invoke the existing artwork action');
    await view.dispose();
    style.remove();
    results.push(
      'PASS: mini artwork expansion works with and without the list, stays clickable, and hides without artwork'
    );
  }
  // Measure constructor calls with the real React renderer, without allocating media devices.
  const nativeAudio = window.Audio;
  let constructions = 0,
    unloads = 0;
  window.Audio = class extends globalThis.EventTarget {
    constructor() {
      super();
      constructions++;
    }
    pause() {}
    removeAttribute() {
      unloads++;
    }
    load() {}
  };
  function OriginalPattern() {
    useRef(new Audio());
    return null;
  }
  for (const strict of [false, true]) {
    const render = async (Component) => {
      const view = mount();
      const before = constructions;
      for (let i = 0; i < 4; i++) {
        const element = <Component key="same-instance" />;
        await view.render(strict ? <React.StrictMode>{element}</React.StrictMode> : element);
      }
      const count = constructions - before;
      await view.dispose();
      return count;
    };
    const original = await render(OriginalPattern);
    const fixed = await render(AudioProvider);
    assert(fixed === 1, 'Audio resource was reconstructed on an update');
    assert(original > fixed, 'Constructor-count comparison did not exercise rerenders');
    results.push(
      `PASS: ${strict ? 'StrictMode' : 'normal'} four-render Audio constructions: original=${original}, fixed=${fixed}`
    );
  }
  assert(unloads >= 2, 'Audio resources were not unloaded on provider cleanup');
  window.Audio = nativeAudio;

  for (const kind of ['albums', 'covers']) {
    const view = mount();
    const actions = [];
    const dispatch = (action) => actions.push(action);
    const requests = new Map();
    let snapshot;
    const load = (_cursor, term) => {
      const pending = deferred();
      requests.set(term, pending);
      return pending.promise;
    };
    window.ipcApi = { getAlbums: load, getCovers: load };
    function Probe({ term }) {
      snapshot =
        kind === 'albums'
          ? useAlbums(0, term, 'DESC', '', dispatch)
          : useAllAlbumsCovers(0, term, 'DESC', 'not-requested', dispatch, 0);
      return null;
    }
    await view.render(<Probe term="old" />);
    await view.render(<Probe term="new" />);
    await act(async () => {
      requests.get('old').resolve({ items: ['old'], nextCursor: null });
    });
    assert(actions.length === 0, `${kind}: obsolete response dispatched stale data`);
    await act(async () => {
      requests.get('new').resolve({ items: ['new'], nextCursor: null });
    });
    assert(
      actions.length === 1 && (actions[0].albums || actions[0].covers)[0] === 'new',
      `${kind}: wrong current result`
    );
    assert(
      snapshot[kind === 'albums' ? 'albumsLoading' : 'coversLoading'] === false,
      `${kind}: loading never finished`
    );
    await view.render(<Probe term="unmounted" />);
    await view.dispose();
    await act(async () => {
      requests.get('unmounted').resolve({ items: ['unmounted'], nextCursor: null });
    });
    assert(actions.length === 1, `${kind}: unmounted response dispatched`);
    results.push(`PASS: ${kind} ignores cursor responses after query replacement and unmount`);
  }

  for (const lateFailure of [false, true]) {
    const view = mount(),
      old = deferred(),
      current = deferred();
    const actions = [];
    const dispatch = (action) => actions.push(action);
    window.ipcApi = {
      setShuffledTracksArray: async () => {},
      getShuffledTracks: () => old.promise,
      getTracks: () => current.promise
    };
    function Probe({ shuffle }) {
      useTracks(
        0,
        '',
        'ASC',
        shuffle ? 'old' : 'new',
        {
          tracks: [],
          tracksShuffle: shuffle,
          listType: 'files',
          pendingAdvance: null
        },
        dispatch,
        shuffle
      );
      return null;
    }
    await view.render(<Probe shuffle={true} />);
    await view.render(<Probe shuffle={false} />);
    await act(async () => {
      current.resolve({ items: [{ track_id: 'current' }], nextCursor: null });
    });
    const before = actions.length;
    await act(async () => {
      if (lateFailure) old.reject(new Error('obsolete request'));
      else old.resolve([{ track_id: 'obsolete' }]);
    });
    assert(
      before === 1 && actions.length === before,
      'Old shuffle result or error overwrote sorted data'
    );
    assert(actions[0].tracks[0].track_id === 'current', 'Sorted data was lost');
    await view.dispose();
    results.push(
      `PASS: late shuffle ${lateFailure ? 'failure' : 'success'} cannot overwrite a newer sort`
    );
  }

  {
    const view = mount(),
      response = deferred(),
      updates = [];
    window.ipcApi = { distinctDirectories: () => response.promise };
    const setDirectories = (rows) => updates.push(rows);
    function Probe() {
      useDistinctDirectories(setDirectories);
      return null;
    }
    await view.render(<Probe />);
    await view.dispose();
    await act(async () => {
      response.resolve(['old folder']);
    });
    assert(updates.length === 0, 'Directory request updated an unmounted component');
    results.push('PASS: directory response is ignored after unmount');
  }
  {
    const view = mount(),
      actions = [],
      calls = [];
    const dispatch = (action) => actions.push(action);
    const firstCursor = { scope: 'test', key: [1, 'a', 1] };
    const pending = deferred();
    window.ipcApi = {
      getAlbums: async (cursor) => {
        calls.push(cursor);
        if (calls.length === 1) return { items: [{ id: 'a' }], nextCursor: firstCursor };
        if (calls.length === 2) return pending.promise;
        return { items: [{ id: 'fresh' }], nextCursor: null };
      }
    };
    function Probe({ page, revision }) {
      useAlbums(page, '', 'ASC', '', dispatch, revision);
      return null;
    }
    await view.render(<Probe page={0} revision={0} />);
    await view.render(<Probe page={1} revision={0} />);
    assert(
      calls[0] === null && calls[1] === firstCursor,
      'Second page used a row offset instead of its cursor'
    );
    await view.render(<Probe page={0} revision={1} />);
    await act(async () => {
      pending.resolve({ items: [{ id: 'stale' }], nextCursor: null });
    });
    assert(
      actions.length === 2 && actions[1].albums[0].id === 'fresh' && actions[1].replace,
      'Catalog refresh appended stale in-flight page data'
    );
    assert(calls[2] === null, 'Catalog refresh reused an obsolete cursor');
    await view.dispose();
    results.push('PASS: cursor paging and scan revisions reject stale in-flight pages');
  }
  {
    const view = mount(),
      first = deferred(),
      actions = [],
      cursors = [];
    const dispatch = (action) => actions.push(action);
    const next = { scope: 'test', key: [1, 'a', 1] };
    window.ipcApi = {
      getAlbums: (cursor) => {
        cursors.push(cursor);
        return cursor === null
          ? first.promise
          : Promise.resolve({ items: [{ id: 'b' }], nextCursor: null });
      }
    };
    function Probe({ page }) {
      useAlbums(page, '', 'ASC', '', dispatch);
      return null;
    }
    await view.render(<Probe page={0} />);
    await view.render(<Probe page={1} />);
    await act(async () => {
      first.resolve({ items: [{ id: 'a' }], nextCursor: next });
    });
    assert(
      cursors.length === 2 && cursors[0] === null && cursors[1] === next,
      'Rapid next-page request lost its prerequisite cursor'
    );
    assert(
      actions.length === 2 &&
        actions[0].replace &&
        !actions[1].replace &&
        actions[1].albums[0].id === 'b',
      'Rapid paging skipped or duplicated a page'
    );
    await view.dispose();
    results.push('PASS: early next-page requests await their cursor without losing rows');
  }
  return results;
})();
