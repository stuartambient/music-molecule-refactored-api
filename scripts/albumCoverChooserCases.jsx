/* global window, document, requestAnimationFrame */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import AlbumCoverChooser from '../src/renderer/src/components/AlbumCoverChooser.jsx';
import reducer from '../src/renderer/src/audioPlayerReducer.js';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const host = document.createElement('div');
document.body.append(host);
const root = createRoot(host);
const album = {
  path: 'I:/Music/Example Quartet - Quiet Hours',
  folder: 'Example Quartet - Quiet Hours'
};
const images = [
  'front.jpg',
  'back.jpg',
  'spectrogram.png',
  'booklet.jpg',
  'A very long alternate cover image filename.png'
].map((name) => ({ name, path: album.path + '/' + name }));
const choices = { current: images[1].path, suggested: images[0].path, images };
let saved, closes, saves, load, save, pick;
window.ipcApi = {
  getAlbumCoverChoices: (...args) => load(...args),
  selectAlbumCover: (...args) => save(...args),
  pickAlbumCover: (...args) => pick(...args)
};
const button = (text) =>
  [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === text);
const click = async (element) => {
  assert(element, 'Missing button');
  await act(async () => {
    element.click();
  });
};
async function mount(result = choices) {
  await act(async () => {
    root.render(null);
  });
  saved = null;
  closes = 0;
  saves = [];
  load = async () => result;
  pick = async () => ({ status: 'cancelled' });
  save = async (...args) => {
    saves.push(args);
    return { path: args[0], img: args[1] };
  };
  await act(async () => {
    root.render(
      <AlbumCoverChooser
        album={album}
        onClose={() => {
          closes++;
        }}
        onSelected={(value) => {
          saved = value;
        }}
      />
    );
  });
}
window.chooserTests = (async () => {
  const results = [];
  await mount();
  assert(document.querySelector('dialog').open, 'Dialog did not open');
  assert(document.querySelectorAll('.album-cover-option').length === 5, 'Images missing');
  assert(
    document.querySelector('[aria-pressed="true"]').title === 'back.jpg',
    'Current cover was not preselected'
  );
  await click(document.querySelector('[title="front.jpg"]'));
  await click(button('Use selected image'));
  assert(saved.img === images[0].path && closes === 1, 'Save did not update/close chooser');
  assert(saves.length === 1, 'Unexpected save count');
  results.push('PASS current selection, manual override and save');
  await mount();
  await click(button('Cancel'));
  assert(closes === 1 && saves.length === 0, 'Cancel wrote a cover');
  results.push('PASS cancel preserves cover');
  await mount({ current: null, suggested: null, images: images.slice(3) });
  assert(button('Use selected image').disabled, 'Ambiguous images silently selected');
  await click(document.querySelector('.album-cover-option'));
  assert(!button('Use selected image').disabled, 'Manual choice unavailable');
  results.push('PASS ambiguous images require a choice');
  await mount({ current: null, suggested: null, images: [] });
  assert(
    document.body.textContent.includes('No supported images'),
    'Empty folder explanation missing'
  );
  load = async () => choices;
  await click(button('Reload images'));
  assert(
    document.querySelectorAll('.album-cover-option').length === 5,
    'Reload did not show added images'
  );
  results.push('PASS empty folder and reload');
  save = async () => {
    throw new Error('File removed');
  };
  await click(button('Use selected image'));
  assert(
    document.querySelector('[role="alert"]') && closes === 0 && saved === null,
    'Failed save disappeared'
  );
  assert(!button('Cancel').disabled, 'Failure left chooser locked');
  results.push('PASS failed save remains reviewable');
  load = async () => {
    throw new Error('Offline');
  };
  await click(button('Reload images'));
  assert(document.querySelector('[role="alert"]'), 'Offline error missing');
  results.push('PASS offline-folder error');
  await mount();
  await click(button('Browse other folders…'));
  assert(
    closes === 0 && saved === null && !button('Cancel').disabled,
    'Cancelled file picker changed the cover'
  );
  pick = async (path) => ({ status: 'success', path, img: path + '/from-downloads.png' });
  await click(button('Browse other folders…'));
  assert(
    closes === 1 && saved.img.endsWith('/from-downloads.png'),
    'Local picker did not apply its saved cover'
  );
  results.push('PASS browse local image success and cancellation');
  await mount();
  pick = async () => {
    throw new Error('Cannot copy image');
  };
  await click(button('Browse other folders…'));
  assert(
    document.querySelector('[role="alert"]') && closes === 0 && !button('Cancel').disabled,
    'Local picker failure left chooser locked'
  );
  results.push('PASS local picker error remains reviewable');
  const before = {
    covers: [
      { fullpath: album.path, img: 'old' },
      { fullpath: 'other', img: 'keep' }
    ],
    playbackTrack: { track_id: 'playing' },
    coversPageNumber: 8
  };
  const after = reducer(before, {
    type: 'album-cover-selected',
    path: album.path,
    img: images[0].path
  });
  assert(
    after.covers[0].img === images[0].path && after.covers[1] === before.covers[1],
    'Wrong cover updated'
  );
  assert(
    after.playbackTrack === before.playbackTrack && after.coversPageNumber === 8,
    'Cover choice changed playback or paging'
  );
  results.push('PASS immediate cover update preserves playback and page position');
  await mount();
  for (
    let frame = 0;
    frame < 120 && ![...document.images].every((image) => image.complete && image.naturalWidth > 0);
    frame++
  ) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  assert(
    [...document.images].every((image) => image.naturalWidth > 0),
    'Thumbnail images did not load'
  );
  window.showCoverTheme = (theme) => {
    document.documentElement.className = theme;
  };
  return results;
})();
