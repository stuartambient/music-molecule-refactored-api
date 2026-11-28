import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import process from 'node:process';

const imageExtension = /\.(jpe?g|png|webp|gif)$/i;
const normalize = (file) => (process.platform === 'win32' ? file.replaceAll('\\', '/') : file);
const imageFiles = (entries) =>
  entries
    .filter((entry) => entry.isFile() && imageExtension.test(entry.name))
    .map((entry) => entry.name)
    .sort(
      (a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }) || a.localeCompare(b)
    );

export function preferredAlbumCover(names) {
  const ranked = names
    .map((name) => {
      const words = path
        .parse(name)
        .name.toLowerCase()
        .split(/[^a-z0-9]+/);
      if (
        words.some((word) =>
          [
            'back',
            'rear',
            'spectrogram',
            'spectrum',
            'booklet',
            'inlay',
            'disc',
            'cd',
            'tray'
          ].includes(word)
        )
      )
        return { name, rank: -1 };
      return {
        name,
        rank: words.includes('front')
          ? 3
          : words.includes('folder')
            ? 2
            : words.includes('cover')
              ? 1
              : 0
      };
    })
    .filter((entry) => entry.rank >= 0);
  if (!ranked.length) return null;
  const best = Math.max(...ranked.map((entry) => entry.rank));
  const matches = ranked.filter((entry) => entry.rank === best);
  return matches.length === 1 ? matches[0].name : null;
}

export function findAlbumCover(folder) {
  const names = imageFiles(fs.readdirSync(folder, { withFileTypes: true }));
  const selected = preferredAlbumCover(names);
  return selected ? normalize(path.join(folder, selected)) : undefined;
}

function catalogAlbum(db, folder) {
  const album = db.prepare('SELECT fullpath, img FROM albums WHERE fullpath = ?').get(folder);
  if (!album) throw new Error('This album is no longer in the catalog.');
  return album;
}

export async function albumCoverChoices(db, folder) {
  const album = catalogAlbum(db, folder);
  const names = imageFiles(await fs.promises.readdir(folder, { withFileTypes: true }));
  const suggested = preferredAlbumCover(names);
  return {
    current: album.img,
    suggested: suggested ? normalize(path.join(folder, suggested)) : null,
    images: names.map((name) => ({ name, path: normalize(path.join(folder, name)) }))
  };
}

export async function selectAlbumCover(db, folder, image) {
  const choices = await albumCoverChoices(db, folder);
  const selected = choices.images.find((candidate) => candidate.path === image);
  if (!selected)
    throw new Error(
      'Choose an image directly inside this album folder. It may have been moved or removed.'
    );
  // Recheck the file before changing the catalog; never write tags or copy artwork.
  if (!(await fs.promises.stat(selected.path)).isFile())
    throw new Error('The selected image is unavailable.');
  const result = db
    .prepare('UPDATE albums SET img = ? WHERE fullpath = ?')
    .run(selected.path, folder);
  if (!result.changes) throw new Error('This album is no longer in the catalog.');
  return { path: folder, img: selected.path };
}

// A scan may have found a missing cover before the user chose one. Recheck at write time.
export function fillMissingAlbumCovers(db, covers) {
  const update = db.prepare('UPDATE albums SET img = ? WHERE fullpath = ? AND img IS NULL');
  return db.transaction(() => {
    let added = 0;
    for (const cover of covers) {
      if (cover.img) added += update.run(cover.img, cover.fullpath).changes;
    }
    return { added };
  })();
}

// Only called with a path returned by the native picker, never a renderer-supplied source.
export async function importAlbumCover(db, folder, source) {
  catalogAlbum(db, folder);
  if (!imageExtension.test(source) || !(await fs.promises.stat(source)).isFile())
    throw new Error('Choose a JPG, PNG, WebP or GIF image.');
  const samePath = (a, b) =>
    process.platform === 'win32'
      ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
      : path.resolve(a) === path.resolve(b);
  if (samePath(path.dirname(source), folder)) {
    const choices = await albumCoverChoices(db, folder);
    const existing = choices.images.find((image) => samePath(image.path, source));
    if (!existing) throw new Error('The selected image is unavailable.');
    return selectAlbumCover(db, folder, existing.path);
  }
  const { name, ext } = path.parse(source);
  let destination = path.join(folder, path.basename(source));
  let copied = false;
  try {
    for (;;) {
      try {
        await fs.promises.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
        copied = true;
        break;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        destination = path.join(folder, `${name}-selected-${randomUUID().slice(0, 8)}${ext}`);
      }
    }
    return await selectAlbumCover(db, folder, normalize(destination));
  } catch (error) {
    if (copied) await fs.promises.rm(destination, { force: true }).catch(() => {});
    throw error;
  }
}

export async function pickAlbumCover(db, folder, chooseFile) {
  catalogAlbum(db, folder);
  const file = await chooseFile();
  if (!file) return { status: 'cancelled' };
  return { status: 'success', ...(await importAlbumCover(db, folder, file)) };
}
