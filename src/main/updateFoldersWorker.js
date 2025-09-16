import { parentPort, workerData } from 'worker_threads';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
/* import fg from 'fast-glob'; */
import Database from 'better-sqlite3';
import searchCover from './utility/searchCover.js';

const mode = import.meta.env.MODE;
const dbPath =
  mode === 'development'
    ? path.join(process.cwd(), import.meta.env.MAIN_VITE_DB_PATH_DEV)
    : path.join(workerData, 'music.db');

const db = new Database(dbPath);
const createRootsTable = `CREATE TABLE IF NOT EXISTS roots ( id INTEGER PRIMARY KEY AUTOINCREMENT, root TEXT UNIQUE)`;
db.exec(createRootsTable);

let newestRoots;

const getRoots = () => {
  const roots = db.prepare('SELECT root FROM roots');

  newestRoots = roots.all().map((row) => row.root);
};

getRoots();

export const insertAlbums = (data) => {
  const insert = db.prepare(
    'INSERT INTO albums(id, rootlocation, foldername, fullpath, img, birthtime, modified) VALUES (@id, @root, @name, @fullpath, @img, @birthtime, @modified)'
  );

  const insertMany = db.transaction((albums) => {
    for (const a of albums) {
      if (!a.img) {
        a.img = null; // or you could use an empty string ''
      }
      insert.run(a);
    }
  });

  insertMany(data);
};

export const deleteAlbums = async (data) => {
  const deleteA = db.prepare('DELETE FROM albums WHERE fullpath = ?');
  const deleteMany = db.transaction((data) => {
    for (const d of data) deleteA.run(d);
  });
  deleteMany(data);
};

export const getAlbums = () => {
  const getAllAlbums = db.prepare('SELECT fullpath FROM albums');
  const albums = getAllAlbums.all();
  return albums;
};

function getStats(folder) {
  return fsPromises.stat(folder).catch((error) => {
    console.error(error);
    return null;
  });
}

const parseNewEntries = (newEntries) => {
  const newAlbums = [];

  for (const entry of newEntries) {
    const id = uuidv4();
    let name, root, fullpath;
    fullpath = entry;
    //birthtime = getStats(entry);
    for (const r of newestRoots) {
      if (entry.startsWith(r)) {
        const newStr = entry.replace(`${r}/`, '');
        root = r;
        name = newStr;
      }
    }

    /*console.log(birthtime, '====', modified); */
    const cover = searchCover(entry);
    /* console.log('name: ' name) */
    const newAlbum = {
      id,
      root,
      name,
      fullpath
    };

    if (cover) {
      newAlbum.img = cover;
    }

    newAlbums.push(newAlbum);
  }
  /*  return newAlbums; */
  return addTimesToAlbums(newAlbums);
};

async function addTimesToAlbums(albums) {
  const albumsWithTimes = await Promise.all(
    albums.map(async (album) => {
      const stats = await getStats(album.fullpath);
      if (stats) {
        album.birthtime = stats.birthtime.toISOString();
        album.modified = stats.mtime.toISOString();
      } else {
        album.birthtime = null;
        album.modified = null;
      }
      return album;
    })
  );

  return albumsWithTimes;
}

const difference = (setA, setB) => {
  const _difference = new Set(setA);
  for (const elem of setB) {
    _difference.delete(elem);
  }
  return _difference;
};

const checkAgainstEntries = (data) => {
  /* console.log('data: ', data); */
  return new Promise((resolve, reject) => {
    let status = { deleted: 0, new: 0, nochange: false };

    try {
      const dbAlbums = getAlbums();
      const dbAlbumsFullpath = dbAlbums.map((album) => album.fullpath);
      /* console.log('DB sample:', dbAlbumsFullpath.slice(0, 3));
      console.log('FS sample:', data.slice(0, 3)); */
      const allAlbums = new Set(data);
      const dbEntries = new Set(dbAlbumsFullpath);

      const newEntries = Array.from(difference(allAlbums, dbEntries));
      const missingEntries = Array.from(difference(dbEntries, allAlbums));

      if (newEntries.length > 0) {
        parseNewEntries(newEntries)
          .then((newAlbums) => {
            insertAlbums(newAlbums);
          })
          .catch((error) => {
            console.error('Error:', error);
          });
        status.new = newEntries.length;
      }
      if (missingEntries.length > 0) {
        deleteAlbums(missingEntries);
        status.deleted = missingEntries.length;
      }
      if (!newEntries.length && !missingEntries.length) {
        status.nochange = true;
      }
      return resolve(status);
    } catch (error) {
      console.error(error.message);
      reject(error);
    }
  });
};

const topDirs = async (root) => {
  /*  const entries = await fsPromises.readdir(root);
  return entries.map((entry) => `${root}/${entry}`); */

  try {
    const entries = await fsPromises.readdir(root, { withFileTypes: true });

    return entries
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => `${root}/${dirent.name}`);
  } catch (err) {
    // Root itself might be missing, unreadable, or not a directory
    console.error(`Skipping root ${root}:`, err.message);
    return [];
  }
};

/* const topDirs = async (root) => {
  try {
    // Ask for Dirent objects (not just strings)
    const entries = await fsPromises.readdir(root, { withFileTypes: true });

    // Only keep directories (ignores files, shortcuts, symlinks, etc.)
    return entries
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => path.join(root, dirent.name));
  } catch (err) {
    // Root itself might not exist or be a shortcut
    console.error(`Error reading root ${root}:`, err.message);
    return [];
  }
}; */

const run = async (cb) => {
  let dirs = [];

  for (const root of newestRoots) {
    /* console.log('root: ', root); */
    const tmp = await topDirs(root);
    dirs = [...dirs, ...tmp];
  }
  Promise.resolve(checkAgainstEntries(dirs)).then((response) => cb(response));
  /* return cb(dirs) */
};

const initAlbums = async () => {
  /* run((result) => res.status(200).send({ 'album-update': result })) */
  return new Promise((res, rej) => {
    try {
      run((result) => res(result));
    } catch (error) {
      console.error(error.message);
      rej(error.message);
    }
  });
};

if (!parentPort) throw Error('IllegalState');
parentPort.on('message', async (message) => {
  console.log('message: ', message);
  try {
    const result = await initAlbums();
    /* const result = addTwoNums(2, 3); */
    parentPort.postMessage({ result });
  } catch (error) {
    parentPort.postMessage({ error: error.message });
  }
});
