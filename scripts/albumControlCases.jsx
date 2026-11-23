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
let state,
  dispatch,
  additions,
  pending,
  albumRows,
  trackRows,
  playlistRows,
  pendingAlbum,
  albumTrackRows,
  albumRequests;
function fixture() {
  albumRequests = 0;
  albumTrackRows = tracks;
  albumRows = [album, other];
  trackRows = [];
  playlistRows = [];
  additions = [];
  pending = null;
  pendingAlbum = null;
  window.ipcApi = {
    getTracks: async () => trackRows,
    getAlbums: async () => [],
    prepareMusicTracks: async (request) => {
      if (request.album) albumRequests++;
      if (request.album && pendingAlbum) return pendingAlbum.promise;
      if (request.album) {
        const entries =
          request.album === album.fullpath
            ? albumTrackRows
            : [
                {
                  track_id: 'other-track',
                  title: 'Another song',
                  audiotrack: other.fullpath + '/01.flac'
                }
              ];
        return {
          tracks: entries,
          catalogTracks: entries,
          requestedCount: entries.length,
          unavailableCount: 0,
          missingCatalogCount: 0,
          examples: []
        };
      }
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
    tracks: trackRows,
    albums: albumRows,
    tracksPageNumber: 0,
    albumsPageNumber: 0,
    playlistTracks: playlistRows,
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
const click = (element, location = new Error().stack) =>
  act(async () => {
    assert(element, `Expected album control is missing: ${location}`);
    element.click();
  });
const expand = async () => {
  // After collapsing a restored virtual row, its header may need to scroll back into view.
  for (
    let attempt = 0;
    attempt < 40 && !document.querySelector('#album-a .item-albumtrack');
    attempt++
  ) {
    await act(async () => {
      document.querySelector('.albums-list').scrollTop = 0;
      await frame();
    });
  }
  await click(document.querySelector('#album-a .item-albumtrack'));
  await act(async () => {
    await frame();
    await frame();
  });
};
const play = (title) =>
  document.querySelector(`#album-a .albumtracks button[aria-label="Play ${title}"]`);
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
  {
    fixture();
    const dispose = await mount();
    await expand();
    await click(document.querySelector('#album-b .item-albumtrack'));
    const loadedAlbumRequests = albumRequests;
    const tab = (name) =>
      [...document.querySelectorAll('.tabs .tab')].find((node) => node.textContent === name);
    const returnToAlbums = async (via) => {
      await click(tab(via));
      await click(tab('albums'));
      for (let attempt = 0; attempt < 40; attempt++) {
        await act(async () => {
          await frame();
        });
        if (
          document.querySelector('#album-a .albumtrack') &&
          document.querySelector('#album-b .albumtrack')
        ) {
          assert(
            albumRequests === loadedAlbumRequests,
            'Switching lists rechecked open albums and flashed availability notices'
          );
          return;
        }
      }
      throw new Error('Switching lists did not preserve both unfolded albums');
    };
    await returnToAlbums('tracks');
    assert(!state.playbackTrack, 'Returning without playback started a track');
    await click(play(tracks[1].title));
    const request = state.playbackRequest;
    for (const via of ['playlist', 'tracks', 'playlist']) {
      await returnToAlbums(via);
      assert(
        document.querySelector('#album-a [data-track-id="two"].is-current'),
        'Switching lists lost the active album track'
      );
      assert(state.playbackRequest === request && !state.pause, 'Switching lists changed playback');
      assert(
        !document.querySelector('#album-b .selection-play'),
        'The unrelated unfolded album received the play icon'
      );
    }
    await dispose();
    results.push(
      'PASS: both unfolded albums survive repeated Tracks and Playlist switches, with and without an active track'
    );
  }
  {
    fixture();
    const dispose = await mount();
    for (
      let attempt = 0;
      attempt < 40 && !document.querySelector('#album-b .item-albumtrack');
      attempt++
    ) {
      await act(async () => {
        await frame();
      });
    }
    await click(document.querySelector('#album-b .item-albumtrack'));
    await act(async () => {
      dispatch({ type: 'library' });
      // Covers loads the album into Playlist, then starts its first track.
      dispatch({ type: 'play-this-album', playlistTracks: tracks, list: 'playlistActive' });
      dispatch({
        type: 'select-track',
        track: tracks[0],
        index: 0,
        list: 'playlistActive',
        play: true
      });
    });
    const request = state.playbackRequest;
    await act(async () => {
      dispatch({ type: 'library' });
      dispatch({ type: 'set-list-type', listType: 'albums' });
    });
    await act(async () => {
      for (let attempt = 0; attempt < 12; attempt++) await frame();
    });
    assert(
      document.querySelector('#album-b .albumtrack'),
      'Covers playback closed a manually unfolded album'
    );
    assert(
      !document.querySelector('#album-a .albumtracks'),
      'Covers playback automatically unfolded its album in Lists'
    );
    assert(
      !document.querySelector('.album-playing'),
      'Playlist playback received an Albums playback highlight'
    );
    assert(
      state.activeList === 'playlistActive' &&
        state.active === tracks[0].track_id &&
        !state.pause &&
        state.playbackRequest === request,
      'Returning to Albums changed Covers playback'
    );
    await dispose();
    results.push(
      'PASS: Covers playback keeps its album folded and preserves manually unfolded albums'
    );
  }
  {
    fixture();
    albumTrackRows = Array.from({ length: 24 }, (_, index) => ({
      track_id: `unfinished-${index}`,
      title: `Unfinished album track ${index + 1}`,
      audiotrack: `${album.fullpath}/${index + 1}.flac`,
      track: index + 1
    }));
    const playlistTrack = {
      track_id: 'playlist-song',
      title: 'Playlist song',
      audiotrack: other.fullpath + '/01.flac'
    };
    playlistRows = [playlistTrack];
    albumRows.push(
      ...Array.from({ length: 60 }, (_, index) => ({
        id: `following-${index}`,
        foldername: `Following ${index}`,
        fullpath: `C:/Music/Following ${index}`
      }))
    );
    const dispose = await mount();
    await expand();
    const unfinished = albumTrackRows[8];
    await click(play(unfinished.title));
    const albumRequest = state.playbackRequest;
    await act(async () => {
      document.querySelector('.albums-list').scrollTop = 1250;
    });
    for (let attempt = 0; attempt < 40; attempt++) {
      await act(async () => {
        await frame();
      });
      if (document.querySelector('#album-b .item-albumtrack')) break;
    }
    await click(document.querySelector('#album-b .item-albumtrack'));
    const tab = (name) =>
      [...document.querySelectorAll('.tabs .tab')].find((node) => node.textContent === name);
    await click(tab('playlist'));
    await act(async () => {
      dispatch({
        type: 'select-track',
        track: playlistTrack,
        index: 0,
        queue: playlistRows,
        list: 'playlistActive',
        play: true,
        playbackSnapshot: { request: albumRequest, position: 45 }
      });
    });
    const playlistRequest = state.playbackRequest;
    await click(tab('albums'));
    let visible = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      await act(async () => {
        await frame();
      });
      const row = document.querySelector(`[data-track-id="${unfinished.track_id}"]`);
      const viewport = document.querySelector('.albums-list').getBoundingClientRect();
      const bounds = row?.getBoundingClientRect();
      visible = Boolean(bounds && bounds.top >= viewport.top && bounds.bottom <= viewport.bottom);
    }
    assert(
      visible,
      'Albums returned to the last unfolded album instead of its unfinished track after Playlist playback'
    );
    assert(
      document.querySelector(`[data-track-id="${unfinished.track_id}"] .selection-play`),
      'Unfinished album track lost its play indicator'
    );
    assert(
      state.listSelections.albumTracksActive.position === 45,
      'Browsing another album erased the unfinished track time'
    );
    assert(
      state.playbackRequest === playlistRequest &&
        state.activeList === 'playlistActive' &&
        !state.pause,
      'Returning to Albums interrupted Playlist playback'
    );
    await click(document.querySelector(`[data-track-id="${unfinished.track_id}"] .selection-play`));
    assert(
      state.playbackStartTime === 45 && state.active === unfinished.track_id,
      'Album track did not resume at its unfinished position'
    );
    await dispose();
    results.push(
      'PASS: unfinished album track takes priority over the last unfolded album after Playlist playback and resumes its saved time'
    );
  }
  for (const theme of ['basic', 'theme-1']) {
    fixture();
    const dispose = await mount(theme);
    const search = document.querySelector('form[aria-label="Search albums"]');
    const input = search.querySelector('input');
    const run = search.querySelector('button');
    const fieldBounds = search.getBoundingClientRect();
    const inputBounds = input.getBoundingClientRect();
    const buttonBounds = run.getBoundingClientRect();
    assert(
      Math.abs(inputBounds.right - buttonBounds.left) < 1,
      'Search input and run button do not meet'
    );
    assert(
      buttonBounds.right <= fieldBounds.right && inputBounds.left >= fieldBounds.left,
      'Search controls extend outside their border'
    );
    input.focus();
    assert(
      getComputedStyle(input).outlineStyle === 'none',
      'Search input has a misplaced independent outline'
    );
    assert(
      getComputedStyle(search).outlineStyle === 'solid',
      'Search field has no shared focus outline'
    );
    input.blur();
    await expand();
    assert(
      !state.playbackTrack,
      'An album with no remembered track automatically started its first track'
    );
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
      document.querySelector('#album-a')?.classList.contains('album-playing'),
      'Playing album was not highlighted'
    );
    assert(
      !document.querySelector('#album-b')?.classList.contains('album-playing'),
      'Unrelated album was highlighted'
    );
    const playingRow = play(tracks[0].title).closest('.albumtrack');
    const albumElement = document.querySelector('#album-a');
    const playingStyle = getComputedStyle(playingRow);
    assert(!albumElement.matches(':hover'), 'Highlight check must run without album hover');
    assert(
      playingStyle.backgroundColor !== getComputedStyle(albumElement).backgroundColor &&
        playingStyle.backgroundColor !== 'rgba(0, 0, 0, 0)',
      'Playing track blends into the selected album without hover'
    );
    assert(playingStyle.boxShadow !== 'none', 'Playing track has no persistent edge marker');
    assert(
      play(tracks[0].title).getAttribute('aria-current') === 'true' &&
        !play(tracks[1].title).closest('.albumtrack').classList.contains('is-current'),
      'Playing-track marker does not identify the current track uniquely'
    );
    const request = state.playbackRequest;
    await click(document.querySelector('#album-b .item-albumtrack'));
    assert(
      document.querySelector('#album-a .albumtrack.is-current'),
      'Opening another album hid the playing track'
    );
    assert(
      document.querySelector('#album-b .albumtrack'),
      'Second album did not unfold independently'
    );
    assert(
      !document.querySelector('#album-b .selection-play'),
      'Browsing another album placed a play indicator on it'
    );
    assert(
      state.listSelections.albumTracksActive.trackId === 'one',
      'Browsing erased the remembered track'
    );
    await click(document.querySelector('#album-b .item-albumtrack'));
    assert(
      document.querySelector('#album-a .albumtrack.is-current'),
      'Collapsing another album hid the playing track'
    );
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
      dispatch({ type: 'pauseplay' });
    });
    assert(
      play(tracks[0].title).closest('.albumtrack').classList.contains('is-current'),
      'Pausing an unfinished album track cleared its highlight'
    );
    await act(async () => {
      dispatch({ type: 'pauseplay' });
    });
    const activeCaretColor = getComputedStyle(play(tracks[0].title).querySelector('svg')).color;
    await act(async () => {
      dispatch({ type: 'advance-track', direction: 1, ended: true, play: true, request });
    });
    assert(
      state.active === 'one' && state.pause,
      'Album track automatically advanced when it ended'
    );
    const checkEndedHighlight = () => {
      const button = play(tracks[0].title);
      const row = button.closest('.albumtrack');
      assert(
        !row.matches('.is-current, .is-selected, .is-remembered') &&
          !row.dataset.selected &&
          !button.hasAttribute('aria-current'),
        'Completed album track retained its highlight'
      );
      assert(
        getComputedStyle(button.querySelector('svg')).color !== activeCaretColor,
        'Completed album track retained its blue play caret'
      );
      assert(
        !document.querySelector('#album-a.album-playing, #album-a.album-selected'),
        'Completed album retained its active highlight'
      );
    };
    checkEndedHighlight();
    const tab = (name) =>
      [...document.querySelectorAll('.tabs .tab')].find((node) => node.textContent === name);
    for (const name of ['playlist', 'tracks']) {
      await click(tab(name));
      if (name === 'playlist') {
        await act(async () => {
          dispatch({
            type: 'select-track',
            track: tracks[0],
            index: 0,
            queue: state.playlistTracks,
            list: 'playlistActive',
            play: true,
            playbackSnapshot: { request, position: 180 }
          });
        });
      }
      await click(tab('albums'));
      for (let attempt = 0; attempt < 40; attempt++) {
        await act(async () => {
          await frame();
        });
        if (play(tracks[0].title)) break;
      }
      checkEndedHighlight();
    }
    const restartRequest = state.playbackRequest;
    await click(play(tracks[0].title));
    assert(
      state.playbackStartTime === 0 && state.playbackRequest === restartRequest + 1 && !state.pause,
      'Reselecting a completed album track did not restart from zero'
    );
    assert(
      play(tracks[0].title).closest('.albumtrack').classList.contains('is-current'),
      'Reselecting the completed track did not restore its highlight'
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
      !document.querySelector('#album-b')?.classList.contains('album-playing'),
      'Inactive Albums should not show a playback highlight owned by another list'
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
  {
    fixture();
    albumRows = [
      album,
      other,
      ...Array.from({ length: 120 }, (_, index) => ({
        id: `extra-${index}`,
        foldername: `Album ${index}`,
        fullpath: `C:/Music/Album ${index}`
      }))
    ];
    const dispose = await mount();
    await expand();
    const scroller = document.querySelector('.albums-list');
    await act(async () => {
      scroller.scrollTop = 1800;
      scroller.dispatchEvent(new Event('scroll'));
      await frame();
      await frame();
    });
    assert(scroller.scrollTop > 1000, 'Scroll restoration test did not scroll the album list');
    const tab = (name) =>
      [...document.querySelectorAll('.tabs .tab')].find((element) => element.textContent === name);
    await click(tab('tracks'));
    assert(
      !document.querySelector('.albums-list'),
      'Inactive albums list was not saved and unmounted'
    );
    await click(tab('albums'));
    const waitForPosition = async () => {
      for (let attempt = 0; attempt < 40; attempt++) {
        await act(async () => {
          await frame();
        });
        if (
          document.querySelector('#album-a') &&
          document.querySelector('.albums-list').scrollTop < 3
        )
          return;
      }
      throw new Error('Albums did not return to the last unfolded album');
    };
    await waitForPosition();
    await act(async () => {
      dispatch({ type: 'library' });
    });
    await act(async () => {
      dispatch({ type: 'library' });
    });
    await waitForPosition();
    const search = document.querySelector('form[aria-label="Search albums"]');
    await act(async () => {
      search.querySelector('input').value = 'new search';
      search.requestSubmit();
      await frame();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 550));
      await frame();
    });
    assert(
      document.querySelector('.albums-list').scrollTop < 3,
      'A new album search restored the old query’s scroll position'
    );
    await dispose();
    results.push(
      'PASS: Albums returns to the last unfolded album across tabs and hidden views, and new searches start at the top'
    );
  }
  {
    fixture();
    const elsewhere = {
      track_id: 'elsewhere',
      title: 'Another song',
      audiotrack: other.fullpath + '/01.flac'
    };
    trackRows = [tracks[0], tracks[1], elsewhere];
    playlistRows = [tracks[0], elsewhere];
    const dispose = await mount();
    const tab = (name) =>
      [...document.querySelectorAll('.tabs .tab')].find((element) => element.textContent === name);
    const switchTo = async (name) => {
      await click(tab(name));
      const selector =
        name === 'albums'
          ? '#album-a'
          : name === 'tracks'
            ? '.files-list .item'
            : '.playlist-list .item';
      for (let attempt = 0; attempt < 40; attempt++) {
        await act(async () => {
          await frame();
        });
        if (document.querySelector(selector)) {
          await act(async () => {
            for (let index = 0; index < 6; index++) await frame();
          });
          return;
        }
      }
      throw new Error(`Selected ${name} list did not render its rows`);
    };
    await switchTo('tracks');
    await click(document.querySelector('.files-list #one--item-div a.track-details'));
    await act(async () => {
      dispatch({ type: 'pauseplay' });
    });
    assert(
      document.querySelector('.files-list #one--item-div').dataset.selected === 'true',
      'Tracks selection was not highlighted'
    );
    await switchTo('albums');
    if (!document.querySelector('#album-a .albumtracks')) await expand();
    await click(play(tracks[1].title));
    assert(
      document.querySelector('#album-a')?.classList.contains('album-selected'),
      'Album selection was not highlighted'
    );
    await switchTo('playlist');
    await click(document.querySelector('.playlist-list #elsewhere--item-div a.track-details'));
    const request = state.playbackRequest;
    assert(
      state.active === 'elsewhere' && !state.pause,
      'Playlist selection did not become the playing track'
    );
    await switchTo('tracks');
    assert(
      !document.querySelector('.files-list #one--item-div')?.classList.contains('active') &&
        document.querySelector('.files-list #one--item-div .selection-play'),
      'Inactive Tracks selection should use a play indicator instead of a highlight'
    );
    await switchTo('albums');
    assert(
      !document.querySelector('#album-a')?.classList.contains('album-selected') &&
        document.querySelector('#album-a .selection-play'),
      'Inactive album selection should use a play indicator instead of a highlight'
    );
    assert(
      !document.querySelector('#album-b')?.classList.contains('album-playing'),
      'Inactive Albums should not show an active playback highlight'
    );
    assert(
      document.querySelector('.albumtrack[data-selected="true"] .album-track-title').textContent ===
        tracks[1].title,
      'The selected album track was not restored'
    );
    await expand();
    await expand();
    assert(
      document.querySelector('.albumtrack[data-selected="true"] .album-track-title').textContent ===
        tracks[1].title,
      'Collapsing and reopening the same album erased its track selection'
    );
    await switchTo('playlist');
    assert(
      document.querySelector('.playlist-list #elsewhere--item-div')?.classList.contains('active'),
      'Playlist selection was not retained'
    );
    assert(
      state.active === 'elsewhere' && !state.pause && state.playbackRequest === request,
      'Returning to a list restarted or changed playback'
    );
    trackRows = [elsewhere, tracks[1], tracks[0]];
    await act(async () => {
      dispatch({ type: 'add-tracks', tracks: trackRows });
    });
    await switchTo('tracks');
    assert(
      document.querySelector('.files-list #one--item-div .selection-play'),
      'Row reloading lost the remembered selection play button'
    );
    await click(document.querySelector('.files-list #one--item-div .selection-play'));
    assert(
      state.active === 'one' && state.activeList === 'tracklistActive' && !state.pause,
      'Tracks indicator did not switch playback to its remembered track'
    );
    assert(
      document.querySelector('.files-list #one--item-div').classList.contains('active') &&
        !document.querySelector('.files-list #one--item-div .selection-play'),
      'Active Tracks did not regain its highlight'
    );
    await switchTo('playlist');
    await click(document.querySelector('.playlist-list #elsewhere--item-div .selection-play'));
    assert(
      state.active === 'elsewhere' && state.activeList === 'playlistActive' && !state.pause,
      'Playlist indicator did not switch playback'
    );
    await switchTo('albums');
    await click(document.querySelector('#album-a .selection-play'));
    assert(
      state.active === 'two' &&
        state.activeList === 'albumTracksActive' &&
        state.playbackAlbumPath === album.fullpath &&
        !state.pause,
      'Album indicator did not play its remembered track'
    );
    assert(
      document.querySelector('#album-a').classList.contains('album-selected') &&
        !document.querySelector('#album-a .selection-play'),
      'Active album did not regain its highlight'
    );
    await switchTo('playlist');
    await click(document.querySelector('.playlist-list #elsewhere--item-div a.track-details'));
    await switchTo('albums');
    await expand();
    assert(
      !document.querySelector('#album-a .albumtracks'),
      'Album should be collapsed before testing a fresh load'
    );
    pendingAlbum = deferred();
    await expand();
    await expand();
    await act(async () => {
      dispatch({
        type: 'select-track',
        track: tracks[0],
        index: 2,
        queue: trackRows,
        list: 'tracklistActive',
        play: true
      });
      pendingAlbum.resolve({ ...available(tracks), catalogTracks: tracks });
    });
    assert(
      state.active === 'one' && state.activeList === 'tracklistActive',
      'A delayed expansion request replaced a newer playback selection'
    );
    assert(
      !document.querySelector('#album-a .albumtrack'),
      'A late response reopened a collapsed album'
    );
    pendingAlbum = null;
    await expand();
    await click(document.querySelector('#album-a .selection-play'));
    assert(
      state.active === 'two' && state.activeList === 'albumTracksActive' && !state.pause,
      'Reopened album did not retain its remembered track play indicator'
    );
    await dispose();
    results.push(
      'PASS: each list restores its own track or album selection after playback elsewhere, without restarting audio'
    );
  }
  {
    fixture();
    albumTrackRows = Array.from({ length: 40 }, (_, index) => ({
      track_id: `long-${index}`,
      title: `Long album track ${index + 1}`,
      audiotrack: `${album.fullpath}/${index + 1}.flac`,
      track: index + 1
    }));
    albumRows.push(
      ...Array.from({ length: 100 }, (_, index) => ({
        id: `tail-${index}`,
        foldername: `Tail ${index}`,
        fullpath: `C:/Music/Tail ${index}`
      }))
    );
    const dispose = await mount();
    await expand();
    const target = albumTrackRows[30];
    await click(play(target.title));
    const request = state.playbackRequest;
    await act(async () => {
      document.querySelector('.albums-list').scrollTop = 4000;
      await frame();
      await frame();
    });
    const tab = (name) =>
      [...document.querySelectorAll('.tabs .tab')].find((node) => node.textContent === name);
    await click(tab('tracks'));
    await click(tab('albums'));
    let visible = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      await act(async () => {
        await frame();
      });
      const row = document.querySelector(`[data-track-id="${target.track_id}"]`);
      const viewport = document.querySelector('.albums-list').getBoundingClientRect();
      const bounds = row?.getBoundingClientRect();
      if (bounds && bounds.top >= viewport.top && bounds.bottom <= viewport.bottom) {
        visible = true;
        break;
      }
    }
    assert(visible, 'Returning to Albums did not reveal the playing track inside a long album');
    assert(
      state.playbackRequest === request && state.active === target.track_id,
      'Restoring the track position restarted playback'
    );
    await dispose();
    results.push(
      'PASS: returning to Albums centers the playing track inside a long album without restarting playback'
    );
  }
  return results;
})();

let disposePreview;
window.showAlbumPreview = async (theme, playing = false) => {
  if (disposePreview) await disposePreview();
  fixture();
  disposePreview = await mount(theme);
  await expand();
  await click(play(tracks[0].title));
  if (!playing)
    await act(async () => {
      dispatch({ type: 'track-to-playlist', playlistTracks: [tracks[1]] });
      dispatch({
        type: 'select-track',
        track: tracks[1],
        index: 0,
        queue: [tracks[1]],
        list: 'playlistActive',
        play: true
      });
    });
  await frame();
  await frame();
};
