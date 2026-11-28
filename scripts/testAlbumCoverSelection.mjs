import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, after } from 'node:test';
import { Worker } from 'node:worker_threads';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import Database from 'better-sqlite3';
import {
  albumCoverChoices,
  selectAlbumCover,
  preferredAlbumCover,
  findAlbumCover,
  fillMissingAlbumCovers,
  importAlbumCover,
  pickAlbumCover
} from '../src/main/albumCoverSelection.js';
import { albumCoverUrl } from '../src/shared/albumCoverUrl.js';
import { localFilePath } from '../src/main/localFilePath.js';
import { canRequest } from '../src/shared/ipcContract.js';
import { validateIpcArguments } from '../src/main/ipcValidation.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'music-album-covers-'));
const normal = (file) => file.replaceAll('\\', '/');
const dbPath = path.join(root, 'catalog.db');
const db = new Database(dbPath);
db.exec('CREATE TABLE albums (fullpath TEXT, img TEXT, foldername TEXT)');
let serial = 0;
function album(names, current = null) {
  const folder = normal(path.join(root, `album-${++serial}`));
  fs.mkdirSync(folder);
  for (const name of names) {
    const file = path.join(folder, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'disposable image fixture');
  }
  db.prepare('INSERT INTO albums VALUES (?, ?, ?)').run(folder, current, 'Preserved album');
  return folder;
}
after(() => {
  db.close();
  assert.equal(path.dirname(root), os.tmpdir());
  assert.ok(path.basename(root).startsWith('music-album-covers-'));
  fs.rmSync(root, { recursive: true, force: true });
});

test('automatic selection prefers front/folder/cover names and rejects obvious non-front images', () => {
  assert.equal(preferredAlbumCover(['back.jpg', 'spectrogram.png', 'FRONT.JPG']), 'FRONT.JPG');
  assert.equal(preferredAlbumCover(['artist - album.jpg']), 'artist - album.jpg');
  assert.equal(preferredAlbumCover(['folder.jpg', 'cover.jpg', 'back.jpg']), 'folder.jpg');
  assert.equal(preferredAlbumCover(['01 - front.png', 'folder.jpg']), '01 - front.png');
  assert.equal(preferredAlbumCover(['cover-back.jpg', 'spectrogram.png', 'disc.jpg']), null);
});

test('ambiguous candidates are never selected by filesystem order', () => {
  for (const files of [
    ['one.jpg', 'two.png'],
    ['front.jpg', 'front.png']
  ]) {
    assert.equal(preferredAlbumCover(files), null);
    assert.equal(preferredAlbumCover([...files].reverse()), null);
  }
});

test('album discovery searches top-level files only, including uppercase extensions', async () => {
  const folder = album(['inside/front.jpg', 'BACK.JPG', 'the album.PNG', 'notes.txt']);
  assert.equal(findAlbumCover(folder), folder + '/the album.PNG');
  const choices = await albumCoverChoices(db, folder);
  assert.deepEqual(
    choices.images.map((image) => image.name),
    ['BACK.JPG', 'the album.PNG']
  );
  assert.equal(findAlbumCover(album(['inside/front.jpg'])), undefined);
});

test('chooser saves an explicit top-level image, preserving other album data', async () => {
  const folder = album(['front.jpg', 'back.jpg']);
  const result = await selectAlbumCover(db, folder, folder + '/back.jpg');
  assert.deepEqual(result, { path: folder, img: folder + '/back.jpg' });
  assert.equal((await albumCoverChoices(db, folder)).current, result.img);
  assert.equal(
    db.prepare('SELECT foldername FROM albums WHERE fullpath = ?').get(folder).foldername,
    'Preserved album'
  );
  assert.equal(fs.readFileSync(folder + '/back.jpg', 'utf8'), 'disposable image fixture');
});

test('unknown albums, outside paths, nested images, non-images and removed files cannot be selected', async () => {
  const folder = album(['front.jpg', 'inside/back.jpg', 'notes.txt'], 'old-cover.jpg');
  for (const image of [root + '/elsewhere.jpg', folder + '/inside/back.jpg', folder + '/notes.txt'])
    await assert.rejects(selectAlbumCover(db, folder, image), /directly inside/);
  fs.unlinkSync(folder + '/front.jpg');
  await assert.rejects(selectAlbumCover(db, folder, folder + '/front.jpg'), /directly inside/);
  await assert.rejects(albumCoverChoices(db, root), /no longer in the catalog/);
  assert.equal((await albumCoverChoices(db, folder)).current, 'old-cover.jpg');
});

test('offline folder errors preserve the catalog cover', async () => {
  const folder = album([], 'keep-this.jpg');
  fs.rmdirSync(folder);
  await assert.rejects(albumCoverChoices(db, folder));
  assert.equal(
    db.prepare('SELECT img FROM albums WHERE fullpath = ?').get(folder).img,
    'keep-this.jpg'
  );
});

test('thumbnail URLs preserve spaces, Unicode, percent signs and URL punctuation', () => {
  const file = 'I:/Music/Artist #1/Front 50% ? \u00e9.png';
  const url = albumCoverUrl(file);
  assert.ok(!url.includes('#') && !url.includes('?'));
  assert.equal(localFilePath(url, 'cover'), file);
});

test('chooser operations are restricted to the main window and validated', () => {
  const folder = normal(path.join(root, 'album'));
  for (const channel of ['get-album-cover-choices', 'select-album-cover', 'pick-album-cover']) {
    assert.equal(canRequest('main', 'invoke', channel), true);
    for (const role of ['editor', 'cover', 'tag-cover', 'recovery'])
      assert.equal(canRequest(role, 'invoke', channel), false);
  }
  validateIpcArguments('get-album-cover-choices', [folder], 'main');
  validateIpcArguments('select-album-cover', [folder, folder + '/front.png'], 'main');
  assert.throws(() => validateIpcArguments('select-album-cover', [folder, {}], 'main'));
});

test('real Update Covers worker fills clear missing covers and preserves existing choices', async () => {
  const chosen = album(['front.jpg', 'back.jpg']);
  await selectAlbumCover(db, chosen, chosen + '/back.jpg');
  const clear = album(['spectrogram.jpg', 'front.jpg']);
  const ambiguous = album(['one.jpg', 'two.jpg']);
  const nested = album(['scans/front.jpg']);
  const legacy = album(['front.jpg'], 'legacy-nested/old.jpg');
  const workerFile = path.join(root, 'cover-worker.cjs');
  const require = createRequire(import.meta.url);
  await build({
    entryPoints: ['src/main/updateCoversWorker.js'],
    outfile: workerFile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    plugins: [
      {
        name: 'native-sqlite',
        setup(builder) {
          builder.onResolve({ filter: /^better-sqlite3$/ }, () => ({
            path: require.resolve('better-sqlite3'),
            external: true
          }));
        }
      }
    ]
  });
  // Remove the deliberately offline fixture before asking the worker to scan missing covers.
  db.prepare('DELETE FROM albums WHERE fullpath NOT IN (?, ?, ?, ?, ?)').run(
    chosen,
    clear,
    ambiguous,
    nested,
    legacy
  );
  const result = await new Promise((resolve, reject) => {
    const worker = new Worker(workerFile, { workerData: dbPath, execArgv: [] });
    let message;
    worker.on('message', (value) => {
      message = value;
    });
    worker.on('error', reject);
    worker.on('exit', (code) =>
      code || message?.error
        ? reject(new Error(message?.error || `exit ${code}`))
        : resolve(message.result)
    );
    worker.postMessage('');
  });
  assert.equal(result.added, 1);
  const img = (folder) => db.prepare('SELECT img FROM albums WHERE fullpath = ?').get(folder).img;
  assert.equal(img(clear), clear + '/front.jpg');
  assert.equal(img(ambiguous), null);
  assert.equal(img(nested), null);
  assert.equal(img(chosen), chosen + '/back.jpg');
  assert.equal(img(legacy), 'legacy-nested/old.jpg');
});

test('a cover-fill result cannot overwrite a choice made after discovery', async () => {
  const folder = album(['front.jpg', 'back.jpg']);
  const staleDiscovery = [{ fullpath: folder, img: folder + '/front.jpg' }];
  await selectAlbumCover(db, folder, folder + '/back.jpg');
  assert.deepEqual(fillMissingAlbumCovers(db, staleDiscovery), { added: 0 });
  assert.equal((await albumCoverChoices(db, folder)).current, folder + '/back.jpg');
});

test('native local choice copies an outside image into the album and preserves the source', async () => {
  const folder = album([], 'keep.jpg');
  const downloads = path.join(root, 'Downloads');
  fs.mkdirSync(downloads);
  const source = path.join(downloads, 'selected.png');
  fs.writeFileSync(source, 'original image bytes');
  const result = await pickAlbumCover(db, folder, async () => source);
  assert.equal(result.status, 'success');
  assert.equal(result.img, folder + '/selected.png');
  assert.equal(fs.readFileSync(result.img, 'utf8'), 'original image bytes');
  assert.equal(fs.readFileSync(source, 'utf8'), 'original image bytes');
  assert.equal((await albumCoverChoices(db, folder)).current, result.img);
});

test('nested local images are copied to the top level; existing top-level images are reused', async () => {
  const folder = album(['art/front.jpg', 'existing.jpg']);
  const nested = await importAlbumCover(db, folder, folder + '/art/front.jpg');
  assert.equal(nested.img, folder + '/front.jpg');
  const before = fs.readdirSync(folder).sort();
  const existing = await importAlbumCover(db, folder, folder + '/existing.jpg');
  assert.equal(existing.img, folder + '/existing.jpg');
  assert.deepEqual(fs.readdirSync(folder).sort(), before);
});

test('local copies cannot overwrite an album image with the same filename', async () => {
  const folder = album(['front.jpg']);
  const source = path.join(root, 'front.jpg');
  fs.writeFileSync(source, 'replacement');
  const result = await importAlbumCover(db, folder, source);
  assert.notEqual(result.img, folder + '/front.jpg');
  assert.equal(fs.readFileSync(folder + '/front.jpg', 'utf8'), 'disposable image fixture');
  assert.equal(fs.readFileSync(result.img, 'utf8'), 'replacement');
});

test('cancel and invalid albums cannot copy files or change covers', async () => {
  const folder = album(['front.jpg'], 'old-cover.jpg');
  assert.deepEqual(await pickAlbumCover(db, folder, async () => null), { status: 'cancelled' });
  assert.equal((await albumCoverChoices(db, folder)).current, 'old-cover.jpg');
  let opened = false;
  await assert.rejects(
    pickAlbumCover(db, root, async () => {
      opened = true;
      return null;
    }),
    /no longer/
  );
  assert.equal(opened, false);
  assert.throws(() =>
    validateIpcArguments('pick-album-cover', [folder, root + '/source.jpg'], 'main')
  );
});

test('failed catalog saves remove only the newly copied image', async () => {
  const folder = album(['keep.jpg'], 'keep.jpg');
  const source = path.join(root, 'new-cover.png');
  fs.writeFileSync(source, 'keep source');
  const failOnSave = {
    prepare(sql) {
      if (sql.startsWith('UPDATE')) throw new Error('Injected catalog failure');
      return db.prepare(sql);
    }
  };
  await assert.rejects(importAlbumCover(failOnSave, folder, source), /Injected catalog failure/);
  assert.deepEqual(fs.readdirSync(folder), ['keep.jpg']);
  assert.equal(fs.readFileSync(source, 'utf8'), 'keep source');
  assert.equal((await albumCoverChoices(db, folder)).current, 'keep.jpg');
});

test('invalid or missing local files preserve the current cover and album contents', async () => {
  const folder = album(['keep.jpg'], 'keep.jpg');
  const text = path.join(root, 'not-an-image.txt');
  fs.writeFileSync(text, 'not an image');
  await assert.rejects(importAlbumCover(db, folder, text), /Choose a JPG/);
  await assert.rejects(importAlbumCover(db, folder, root + '/missing.png'));
  assert.deepEqual(fs.readdirSync(folder), ['keep.jpg']);
  assert.equal((await albumCoverChoices(db, folder)).current, 'keep.jpg');
});

test(
  'native Windows paths with different casing reuse the catalog-folder image',
  { skip: os.platform() !== 'win32' },
  async () => {
    const folder = album(['Front.JPG']);
    const result = await importAlbumCover(
      db,
      folder,
      (folder + '/Front.JPG').toUpperCase().replaceAll('/', '\\')
    );
    assert.equal(result.img, folder + '/Front.JPG');
    assert.deepEqual(fs.readdirSync(folder), ['Front.JPG']);
  }
);
