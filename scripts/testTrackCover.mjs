import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { File, Picture, MpegAudioFileSettings, TagTypes } from 'node-taglib-sharp';
import { getTrackCover } from '../src/main/trackCover.js';

const track = path.resolve('fixture/album/track.mp3');
const directory = path.dirname(track);
function fixture(pictures = []) {
  const state = { disposed: 0, searches: [] };
  return {
    state,
    options: {
      getRoot: () => ['parent-cover-folder'],
      openFile: async () => ({
        tag: { pictures },
        dispose: () => {
          state.disposed++;
        }
      }),
      searchCover: async (folder) => {
        assert.equal(state.disposed, 1, 'File must be closed before searching folders');
        state.searches.push(folder);
        return null;
      }
    }
  };
}

test('embedded artwork takes priority and survives disposal of its owning file', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const { state, options } = fixture([{ data: bytes }]);
  options.openFile = () => ({
    tag: { pictures: [{ data: bytes }] },
    dispose() {
      state.disposed++;
      bytes.fill(0);
    }
  });
  const result = await getTrackCover(track, options);
  assert.deepEqual(result, new Uint8Array([1, 2, 3]));
  assert.equal(state.disposed, 1);
  assert.deepEqual(state.searches, []);
});

test('directory fallback starts only after the TagLib file is disposed', async () => {
  const { state, options } = fixture();
  const cover = Buffer.from('directory cover');
  options.searchCover = async (folder) => {
    assert.equal(state.disposed, 1);
    state.searches.push(folder);
    return cover;
  };
  assert.equal(await getTrackCover(track, options), cover);
  assert.deepEqual(state.searches, [directory]);
});

test('parent fallback retains its order and input shape', async () => {
  const { state, options } = fixture();
  const cover = Buffer.from('parent cover');
  options.searchCover = async (folder) => {
    assert.equal(state.disposed, 1);
    state.searches.push(folder);
    return Array.isArray(folder) ? cover : null;
  };
  assert.equal(await getTrackCover(track, options), cover);
  assert.deepEqual(state.searches, [directory, ['parent-cover-folder']]);
});

test('no artwork retains the zero result, including when there are no parent folders', async () => {
  const { state, options } = fixture();
  assert.equal(await getTrackCover(track, options), 0);
  assert.equal(state.disposed, 1);
  options.getRoot = () => [];
  state.disposed = 0;
  state.searches = [];
  assert.equal(await getTrackCover(track, options), 0);
  assert.deepEqual(state.searches, [directory]);
});

test('embedded tag read failures dispose the file once and preserve the failure', async () => {
  const { state, options } = fixture();
  const failure = new Error('Unreadable artwork');
  options.openFile = () => ({
    get tag() {
      throw failure;
    },
    dispose() {
      state.disposed++;
    }
  });
  await assert.rejects(getTrackCover(track, options), (error) => error === failure);
  assert.equal(state.disposed, 1);
  assert.deepEqual(state.searches, []);
});

test('failed opens do not invent a handle or change error behavior', async () => {
  const { state, options } = fixture();
  const failure = new Error('Missing file');
  options.openFile = async () => {
    throw failure;
  };
  await assert.rejects(getTrackCover(track, options), (error) => error === failure);
  assert.equal(state.disposed, 0);
  assert.deepEqual(state.searches, []);
});

test('folder-search failures occur after cleanup, without disposing twice', async () => {
  const { state, options } = fixture();
  const failure = new Error('Folder lookup failed');
  options.searchCover = async () => {
    assert.equal(state.disposed, 1);
    throw failure;
  };
  await assert.rejects(getTrackCover(track, options), (error) => error === failure);
  assert.equal(state.disposed, 1);
});

const mp3 =
  '/+MYxAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxDsAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxHYAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';

test('real embedded MP3 artwork is copied correctly and its file is disposed', async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'music-cover-cleanup-'));
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    'base64'
  );
  const audio = path.join(temporaryRoot, 'track.mp3'),
    image = path.join(temporaryRoot, 'cover.png');
  let file;
  try {
    fs.writeFileSync(audio, Buffer.from(mp3, 'base64'));
    fs.writeFileSync(image, png);
    MpegAudioFileSettings.defaultTagTypes = TagTypes.Id3v2;
    file = File.createFromPath(audio);
    file.tag.pictures = [Picture.fromPath(image)];
    file.save();
    file.dispose();
    file = null;
    let disposed = 0;
    const cover = await getTrackCover(audio, {
      getRoot: () => [],
      searchCover: () => {
        throw new Error('Embedded art should win');
      },
      openFile: (filename) => {
        const opened = File.createFromPath(filename);
        return {
          tag: opened.tag,
          dispose: () => {
            disposed++;
            opened.dispose();
          }
        };
      }
    });
    assert.deepEqual(Buffer.from(cover), png);
    assert.equal(disposed, 1);
  } finally {
    file?.dispose();
    assert.equal(path.dirname(temporaryRoot), os.tmpdir());
    assert.ok(path.basename(temporaryRoot).startsWith('music-cover-cleanup-'));
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
