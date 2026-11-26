import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TagTypes } from 'node-taglib-sharp';
import { inspectTags } from '../src/main/tag-inspector.js';

test('a path inspection closes its file and returns detached tag information', async () => {
  let disposed = 0;
  const result = await inspectTags('album/track.mp3', async (filename) => {
    assert.equal(filename, 'album/track.mp3');
    return {
      tagTypesOnDisk: TagTypes.Id3v1 | TagTypes.Id3v2,
      dispose() {
        disposed++;
      }
    };
  });
  assert.equal(disposed, 1);
  assert.deepEqual(result, {
    file: 'album/track.mp3',
    fileType: 'mp3',
    mask: TagTypes.Id3v1 | TagTypes.Id3v2,
    typesList: ['Id3v1', 'Id3v2'],
    activeMask: TagTypes.Id3v1 | TagTypes.Id3v2
  });
});

test('a failed path inspection still closes its file exactly once', async () => {
  let disposed = 0;
  const error = new Error('Cannot read tag mask');
  await assert.rejects(
    inspectTags('album/track.flac', () => ({
      get tagTypesOnDisk() {
        throw error;
      },
      dispose() {
        disposed++;
      }
    })),
    (failure) => failure === error
  );
  assert.equal(disposed, 1);
});

test('borrowed files stay open on both success and failure', async () => {
  let disposed = 0;
  const file = {
    name: 'album/track.flac',
    tagTypesOnDisk: TagTypes.Xiph,
    dispose() {
      disposed++;
    }
  };
  assert.equal((await inspectTags(file)).fileType, 'flac');
  assert.equal(disposed, 0);
  const error = new Error('Cannot read borrowed file');
  Object.defineProperty(file, 'tagTypesOnDisk', {
    get() {
      throw error;
    }
  });
  await assert.rejects(inspectTags(file), (failure) => failure === error);
  assert.equal(disposed, 0);
});

test('an unsuccessful open propagates its error without inventing a handle', async () => {
  const error = new Error('Missing path');
  await assert.rejects(
    inspectTags('missing.mp3', async () => {
      throw error;
    }),
    (failure) => failure === error
  );
});
