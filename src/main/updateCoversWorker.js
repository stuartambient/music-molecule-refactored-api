import { parentPort, workerData } from 'worker_threads';
import path from 'node:path';
import Database from 'better-sqlite3';
import fg from 'fast-glob';

const mode = import.meta.env.MODE;
const dbPath =
  mode === 'development'
    ? path.join(process.cwd(), import.meta.env.MAIN_VITE_DB_PATH_DEV)
    : path.join(workerData, 'music.db');

const db = new Database(dbPath);

export const getAlbums = () => {
  const getAllAlbums = db.prepare('SELECT fullpath FROM albums');
  const albums = getAllAlbums.all();
  return albums;
};

export const getAlbumsNullImg = () => {
  const getAllAlbums = db.prepare('SELECT fullpath, img FROM albums WHERE img IS NULL');
  const albums = getAllAlbums.all();
  return albums;
};

export const updateCoversInDatabase = (coversArray) => {
  const updateStmt = db.prepare(`
      UPDATE albums
      SET img = @img
      WHERE fullpath = @fullpath
    `);
  try {
    const transaction = db.transaction((coversArray) => {
      coversArray.forEach((cover) => {
        if (!cover.img) return;
        updateStmt.run(cover);
      });
    });
    transaction(coversArray);
    /* return `found ${coversArray.length} covers`; */
    return { added: coversArray.length };
  } catch (e) {
    return e.message;
  }
};

async function searchCover(folder) {
  const cover = await fg('**/*.{jpg,jpeg,png,webp,gif}', {
    caseSensitiveMatch: false,
    cwd: folder
  });

  if (cover.length > 0) {
    return `${folder}/${cover[0]}`;
  }
  return;
}

const updateCoversLink = async () => {
  console.log('updateCoversLink');
  const allAlbumsRootFolder = await getAlbumsNullImg();

  const covers = await Promise.all(
    allAlbumsRootFolder.map(async (folder) => ({
      fullpath: folder.fullpath,
      img: await searchCover(folder.fullpath)
    }))
  );

  const coversFiltered = covers.filter((cvr) => cvr.img !== undefined);

  const processedCovers = updateCoversInDatabase(coversFiltered);
  return processedCovers;
};

const initCovers = async () => {
  return await updateCoversLink(); // Simply return the result of updateCoversLink
};

if (!parentPort) throw Error('IllegalState');
parentPort.on('message', async () => {
  try {
    const result = await initCovers();
    /* const result = addTwoNums(2, 3); */
    parentPort.postMessage({ result });
  } catch (error) {
    parentPort.postMessage({ error: error.message });
  }
});
