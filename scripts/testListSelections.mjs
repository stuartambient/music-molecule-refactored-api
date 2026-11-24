import assert from 'node:assert/strict';
import { test } from 'node:test';
import reducer from '../src/renderer/src/audioPlayerReducer.js';
import { selectedTrackIndex } from '../src/renderer/src/utility/listSelection.js';

const a = { track_id: 'a', audiotrack: 'C:/Music/A/01.flac' };
const b = { track_id: 'b', audiotrack: 'C:/Music/A/02.flac' };
const c = { track_id: 'c', audiotrack: 'C:/Music/B/01.flac' };
const initial = () => ({
  playbackRequest: 0,
  pause: true,
  tracks: [a, b, c],
  playlistTracks: [a, c],
  listSelections: {}
});
const select = (state, track, list, queue, index, albumPath) =>
  reducer(state, { type: 'select-track', track, list, queue, index, albumPath, play: true });

test('each list retains its own selection while playback belongs to another list', () => {
  let state = select(initial(), a, 'tracklistActive', [a, b, c], 0);
  state = select(state, b, 'albumTracksActive', [a, b], 1, 'C:/Music/A');
  state = select(state, c, 'playlistActive', [a, c], 1);
  const before = state.playbackRequest;
  for (const listType of ['files', 'albums', 'playlist', 'files']) {
    state = reducer(state, { type: 'set-list-type', listType });
    assert.equal(selectedTrackIndex(state, 'tracklistActive', state.tracks), 0);
    assert.equal(selectedTrackIndex(state, 'playlistActive', state.playlistTracks), 1);
    assert.equal(state.listSelections.albumTracksActive.albumPath, 'C:/Music/A');
    assert.equal(selectedTrackIndex(state, 'albumTracksActive', [a, b]), 1);
    assert.equal(state.active, 'c');
    assert.equal(state.pause, false);
    assert.equal(state.playbackRequest, before);
  }
});

test('selection follows track IDs after row changes and retains a duplicate playlist occurrence', () => {
  const state = select(initial(), a, 'playlistActive', [a, a, c], 1);
  assert.equal(selectedTrackIndex(state, 'playlistActive', [a, a, c]), 1);
  assert.equal(selectedTrackIndex(state, 'playlistActive', [c, a]), 1);
  assert.equal(selectedTrackIndex(state, 'playlistActive', [c]), -1);
  const file = select(state, b, 'tracklistActive', [a, b, c], 1);
  assert.equal(selectedTrackIndex(file, 'tracklistActive', [b, c, a]), 0);
});

test('browsing another album does not alter playback, and manual Next remembers its playback album', () => {
  const playing = select(initial(), a, 'albumTracksActive', [a, b], 0, 'C:/Music/A');
  const browsed = reducer(playing, { type: 'select-album', albumPath: 'C:/Music/B' });
  assert.equal(browsed.playbackRequest, playing.playbackRequest);
  assert.equal(browsed.playbackTrack, a);
  assert.equal(browsed.selectedAlbumPath, 'C:/Music/B');
  assert.equal(browsed.listSelections.albumTracksActive.albumPath, 'C:/Music/A');
  assert.equal(browsed.listSelections.albumTracksActive.trackId, 'a');
  const next = reducer(browsed, { type: 'advance-track', direction: 1 });
  assert.equal(next.active, 'b');
  assert.equal(next.listSelections.albumTracksActive.albumPath, 'C:/Music/A');
});

test('sorting and scoped resets clear Tracks selection while preserving the other lists', () => {
  let state = select(initial(), b, 'albumTracksActive', [a, b], 1, 'C:/Music/A');
  state = select(state, c, 'playlistActive', [a, c], 1);
  state = select(state, a, 'tracklistActive', [a, b, c], 0);
  for (const action of [
    { type: 'sort-tracks' },
    { type: 'reset', pause: true, selectionList: 'tracklistActive' }
  ]) {
    const cleared = reducer(state, action);
    assert.equal(cleared.playbackTrack, null);
    assert.equal(selectedTrackIndex(cleared, 'tracklistActive', [a, b, c]), -1);
    assert.equal(selectedTrackIndex(cleared, 'playlistActive', [a, c]), 1);
    assert.equal(cleared.listSelections.albumTracksActive.albumPath, 'C:/Music/A');
  }
  const stopped = reducer(state, { type: 'reset', pause: true });
  assert.deepEqual(stopped.listSelections, {});
});

test('catalog refresh invalidates affected pages without restarting playback or losing selections', () => {
  let state = select(initial(), b, 'tracklistActive', [a, b, c], 1);
  const request = state.playbackRequest,
    selection = state.listSelections;
  state = reducer(state, { type: 'catalog-changed', kind: 'files' });
  assert.deepEqual(state.tracks, []);
  assert.equal(state.tracksPageNumber, 0);
  assert.equal(state.tracksRevision, 1);
  assert.deepEqual(state.playbackQueue, [a, b, c]);
  assert.equal(state.playbackRequest, request);
  assert.equal(state.listSelections, selection);
  assert.equal(state.pause, false);
  state = reducer(
    { ...state, albums: [{}], covers: [{}], albumsPageNumber: 3, coversPageNumber: 4 },
    { type: 'catalog-changed', kind: 'folders' }
  );
  assert.deepEqual(state.albums, []);
  assert.deepEqual(state.covers, []);
  assert.equal(state.albumsPageNumber, 0);
  assert.equal(state.coversPageNumber, 0);
  assert.equal(state.albumsRevision, 1);
  assert.equal(state.coversRevision, 1);
  assert.equal(state.playbackRequest, request);
  assert.equal(state.pause, false);
});

test('a pre-refresh page arriving before effect cleanup cannot restore obsolete rows or errors', () => {
  const files = reducer(initial(), { type: 'catalog-changed', kind: 'files' });
  for (const type of ['add-tracks', 'tracks-playlist', 'tracks-load-failed']) {
    assert.equal(
      reducer(files, { type, revision: 0, tracks: [a], error: { message: 'obsolete' } }),
      files
    );
  }
  assert.deepEqual(
    reducer(files, { type: 'add-tracks', revision: 1, tracks: [b], hasMore: false }).tracks,
    [b]
  );
  const folders = reducer(
    { ...initial(), albums: [], covers: [] },
    { type: 'catalog-changed', kind: 'folders' }
  );
  assert.equal(reducer(folders, { type: 'albums-playlist', revision: 0, albums: [a] }), folders);
  assert.equal(reducer(folders, { type: 'set-covers', revision: 0, covers: [a] }), folders);
});
