import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sortAlbumTracks, trackNumber } from '../src/renderer/src/utility/albumTrackOrder.js';

test('album tracks sort numerically by disc and track, with natural filenames as a fallback', () => {
  const tracks = [
    { id: 'disc2', disc: '2', track: '1' },
    { id: 'ten', disc: 1, track: '10/12' },
    { id: 'unknown12', disc: null, track: 0, audiotrack: '12-outro.flac' },
    { id: 'two', track: '02', trackCount: 12 },
    { id: 'unknown2', audiotrack: '2-interlude.flac' }
  ];
  assert.deepEqual(
    sortAlbumTracks(tracks).map((track) => track.id),
    ['two', 'ten', 'unknown2', 'unknown12', 'disc2']
  );
  assert.equal(tracks[0].id, 'disc2');
});

test('missing or invalid numbers are ignored and track count does not reorder tracks', () => {
  for (const value of [null, undefined, '', 0, -1, 'unknown', '3.5', false])
    assert.equal(trackNumber(value), null);
  assert.equal(trackNumber(' 03 / 12 '), 3);
  assert.equal(trackNumber(2), 2);
  const tracks = [
    { id: 'first', track: 1, trackCount: 99 },
    { id: 'second', track: 2, trackCount: 2 }
  ];
  assert.deepEqual(
    sortAlbumTracks(tracks).map((track) => track.id),
    ['first', 'second']
  );
});
