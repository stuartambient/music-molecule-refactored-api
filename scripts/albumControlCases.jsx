import React, { act, useReducer } from 'react';
import { createRoot } from 'react-dom/client';
import { MainAudioContext } from '../src/renderer/src/mainAudioContext';
import reducer from '../src/renderer/src/audioPlayerReducer';
import InfiniteList from '../src/renderer/src/components/InfiniteList';
import { mainThemes } from '../src/shared/themePreferences';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const style = document.createElement('style');
style.textContent =
  window.albumCss +
  `
.albums-fixture { grid-template-columns: minmax(0, 1fr); grid-template-rows: 40px 40px minmax(0, 1fr); }
.albums-fixture .results { grid-column: 1 / -1; }
.albums-fixture > h1 { font-size: 1.1rem; padding: 0.5rem; color: var(--ui-text); background: var(--ui-raised); }
`;
document.head.append(style);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const album = {
  id: 'album-a',
  foldername: 'Collected Sessions',
  fullpath: 'C:/Music/Collected Sessions'
};
const other = { id: 'album-b', foldername: 'Another Album', fullpath: 'C:/Music/Another Album' };
const tracks = [
  {
    track_id: 'one',
    title: 'A Quiet Morning',
    audiotrack: album.fullpath + '/01.flac',
    disc: 1,
    track: 1,
    trackCount: 2
  },
  {
    track_id: 'two',
    title: 'Under the Pines',
    audiotrack: album.fullpath + '/02.flac',
    disc: 1,
    track: 2,
    trackCount: 2
  }
];
let state, dispatch, additions, pending;
function fixture() {
  additions = [];
  pending = null;
  window.ipcApi = {
    getTracks: async () => [],
    getAlbums: async () => [],
    prepareMusicTracks: async (request) => {
      if (request.album)
        return {
          tracks,
          catalogTracks: tracks,
          requestedCount: tracks.length,
          unavailableCount: 0,
          missingCatalogCount: 0,
          examples: []
        };
      additions.push(request.tracks);
      return pending.promise;
    },
    showContextMenu() {}
  };
}
function Fixture({ theme }) {
  const [current, send] = useReducer(reducer, {
    mainTheme: theme,
    listType: 'albums',
    library: true,
    player: true,
    home: false,
    update: false,
    tagEditor: false,
    minimalmode: false,
    miniModePlaylist: false,
    tracks: [],
    albums: [album, other],
    tracksPageNumber: 0,
    albumsPageNumber: 0,
    playlistTracks: [],
    tracksShuffle: false,
    playlistShuffle: false,
    playbackTrack: null,
    playbackQueue: [],
    playbackRequest: 0,
    playbackError: null,
    active: '',
    activeList: '',
    newtrack: '',
    pause: true,
    pendingAdvance: null,
    listScroll: false,
    flashDiv: null,
    tracksHasMore: false
  });
  state = current;
  dispatch = send;
  return (
    <MainAudioContext.Provider value={{ state: current, dispatch: send }}>
      <div className={`container albums-fixture ${theme}`}>
        <h1>Music library</h1>
        <InfiniteList />
      </div>
    </MainAudioContext.Provider>
  );
}
async function mount(theme = 'basic') {
  const element = document.createElement('div');
  document.body.append(element);
  document.documentElement.classList.remove(...mainThemes);
  document.documentElement.classList.add(theme);
  const root = createRoot(element);
  await act(async () => {
    root.render(
      <React.StrictMode>
        <Fixture theme={theme} />
      </React.StrictMode>
    );
  });
  await act(async () => {
    await frame();
    await frame();
  });
  return async () => {
    await act(async () => {
      root.unmount();
    });
    element.remove();
  };
}
const click = (element) =>
  act(async () => {
    assert(element, 'Expected album control is missing');
    element.click();
  });
const expand = async () => {
  await click(document.querySelector('#album-a .item-albumtrack'));
  await act(async () => {
    await frame();
    await frame();
  });
};
const play = (title) => document.querySelector(`.albumtracks button[aria-label="Play ${title}"]`);
const add = (title) =>
  document.querySelector(`.albumtracks button[aria-label="Add ${title} to playlist"]`);
const available = (entries) => ({
  tracks: entries,
  requestedCount: entries.length,
  unavailableCount: 0,
  missingCatalogCount: 0,
  examples: []
});

window.albumTests = (async () => {
  const results = [];
  for (const theme of ['basic', 'theme-1']) {
    fixture();
    const dispose = await mount(theme);
    await expand();
    assert(
      document.querySelectorAll('.albumtrack').length === 2,
      'Expanding an album did not render both tracks'
    );
    await click(play(tracks[0].title));
    assert(
      state.active === 'one' && !state.pause,
      'Album track play action did not select and play'
    );
    assert(
      document.querySelector('#album-a').classList.contains('album-playing'),
      'Playing album was not highlighted'
    );
    assert(
      !document.querySelector('#album-b').classList.contains('album-playing'),
      'Unrelated album was highlighted'
    );
    const request = state.playbackRequest;
    pending = deferred();
    await click(add(tracks[0].title));
    const addButton = document.querySelector('.albumtrack .album-add-track');
    assert(
      addButton.disabled && addButton.getAttribute('aria-busy') === 'true',
      'Pending add button is not disabled'
    );
    await act(async () => {
      pending.resolve(available([tracks[0]]));
    });
    assert(
      state.playlistTracks.length === 1 && state.playlistTracks[0].track_id === 'one',
      'Single-track add did not survive the notice rerender or added the whole album'
    );
    assert(
      state.active === 'one' && !state.pause && state.playbackRequest === request,
      'Adding to playlist changed playback'
    );
    assert(
      additions.length === 1 && additions[0].length === 1,
      'Availability check requested the whole album'
    );
    const added = document.querySelector(
      `button[aria-label="${tracks[0].title} is already in playlist"]`
    );
    assert(added.disabled, 'Already-added track does not show its playlist status');
    await click(added);
    assert(additions.length === 1, 'Duplicate click issued another add request');
    await act(async () => {
      dispatch({ type: 'advance-track', direction: 1, ended: true, play: true, request });
    });
    assert(
      state.active === 'one' && state.pause,
      'Album track automatically advanced when it ended'
    );
    await act(async () => {
      dispatch({ type: 'advance-track', direction: 1, play: true });
    });
    assert(state.active === 'two' && !state.pause, 'Manual Next no longer works for album tracks');
    pending = deferred();
    await click(add(tracks[1].title));
    await expand(); // Collapse before the pending request returns.
    await act(async () => {
      pending.resolve(available([tracks[1]]));
    });
    assert(state.playlistTracks.length === 1, 'A collapsed album applied a late add response');
    await expand();
    pending = deferred();
    await click(add(tracks[1].title));
    await act(async () => {
      pending.resolve({ ...available([]), requestedCount: 1, unavailableCount: 1 });
    });
    assert(
      state.playlistTracks.length === 1 && state.musicNotice?.message.includes('unavailable'),
      'Unavailable track replaced the playlist or failed silently'
    );
    await act(async () => {
      dispatch({
        type: 'select-track',
        track: { track_id: 'other', audiotrack: other.fullpath + '/01.flac' },
        index: 0,
        list: 'playlistActive',
        queue: [],
        play: true
      });
    });
    assert(
      document.querySelector('#album-b').classList.contains('album-playing'),
      'Album highlight does not follow playback from another list'
    );
    await act(async () => {
      dispatch({ type: 'reset', pause: true });
    });
    assert(
      !document.querySelector('.album-playing'),
      'Stopping playback left the old album highlighted'
    );
    await dispose();
    results.push(
      `PASS: ${theme} album highlighting, single-track ending, manual Next, individual playlist additions, duplicate status, and late/offline responses`
    );
  }
  return results;
})();

let disposePreview;
window.showAlbumPreview = async (theme) => {
  if (disposePreview) await disposePreview();
  fixture();
  disposePreview = await mount(theme);
  await expand();
  await click(play(tracks[0].title));
  await act(async () => {
    dispatch({ type: 'track-to-playlist', playlistTracks: [tracks[1]] });
  });
  await frame();
  await frame();
};
