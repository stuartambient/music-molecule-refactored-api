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
const timers = () => {
  const nativeSet = window.setTimeout,
    nativeClear = window.clearTimeout;
  const jobs = [];
  window.setTimeout = (callback, delay, ...args) => {
    if (delay !== 250 && delay !== 500) return nativeSet(callback, delay, ...args);
    const job = { callback, cancelled: false };
    jobs.push(job);
    return job;
  };
  window.clearTimeout = (id) => {
    if (jobs.includes(id)) id.cancelled = true;
    else nativeClear(id);
  };
  return {
    jobs,
    restore() {
      window.setTimeout = nativeSet;
      window.clearTimeout = nativeClear;
    }
  };
};

window.lifecycleTests = (async () => {
  const results = [];
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
  window.Audio = class {
    constructor() {
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
    const clock = timers();
    const view = mount();
    const actions = [];
    const dispatch = (action) => actions.push(action);
    let snapshot;
    window.ipcApi = {
      getAlbums: async (_page, term) => [term],
      getCovers: async (_page, term) => [term]
    };
    function Probe({ term }) {
      snapshot =
        kind === 'albums'
          ? useAlbums(0, term, 'DESC', '', dispatch)
          : useAllAlbumsCovers(0, term, 'DESC', 'not-requested', dispatch, 0);
      return null;
    }
    try {
      await view.render(<Probe term="old" />);
      const old = clock.jobs.at(-1);
      await view.render(<Probe term="new" />);
      assert(old.cancelled, `${kind}: old result timer was not cancelled`);
      await act(async () => {
        old.callback();
      });
      assert(actions.length === 0, `${kind}: cancelled callback dispatched stale data`);
      await act(async () => {
        clock.jobs.at(-1).callback();
      });
      assert(actions.length === 1, `${kind}: current result did not dispatch`);
      assert((actions[0].albums || actions[0].covers)[0] === 'new', `${kind}: wrong result`);
      assert(
        snapshot[kind === 'albums' ? 'albumsLoading' : 'coversLoading'] === false,
        `${kind}: loading never finished`
      );
      await view.render(<Probe term="unmounted" />);
      const pending = clock.jobs.at(-1);
      await view.dispose();
      assert(pending.cancelled, `${kind}: unmount did not clear result timer`);
      await act(async () => {
        pending.callback();
      });
      assert(actions.length === 1, `${kind}: unmounted callback dispatched`);
      results.push(`PASS: ${kind} ignores delayed callbacks after replacement and unmount`);
    } finally {
      clock.restore();
    }
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
      current.resolve([{ track_id: 'current' }]);
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
  return results;
})();
