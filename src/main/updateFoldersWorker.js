import { parentPort, workerData } from 'worker_threads';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';
import searchCover from './utility/searchCover.js';
import { findScanRoot, scanRoots } from './utility/scanRoots.js';
import { commitScanChanges } from './utility/scanWrites.js';

const mode = import.meta.env.MODE;
const dbPath =
  mode === 'development'
    ? path.join(process.cwd(), import.meta.env.MAIN_VITE_DB_PATH_DEV)
    : workerData;

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
    const root = findScanRoot(entry, newestRoots);
    const name = path.basename(entry);
    const cover = searchCover(entry);
    /* console.log('name: ' name) */
    const newAlbum = {
      id,
      root,
      name,
      fullpath: entry
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

async function listFolders(root) {
  const entries = await fsPromises.readdir(root, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => `${root}/${entry.name}`);
}

async function processFolders() {
  const scan = await scanRoots(newestRoots, listFolders);
  const { added, missing } = scan.compare(getAlbums().map((row) => row.fullpath));

  const parsed = added.length ? await parseNewEntries(added) : [];
  const committed = commitScanChanges(db, 'folders', parsed, missing, insertAlbums);

  return {
    new: committed.added.length,
    deleted: committed.deleted.length,
    nochange: !committed.added.length && !committed.deleted.length,
    skippedRoots: scan.skippedRoots
  };
}

if (!parentPort) throw Error('IllegalState');
parentPort.on('message', async () => {
  try {
    const result = await processFolders();
    parentPort.postMessage({ result });
  } catch (error) {
    parentPort.postMessage({ error: error.message });
  } finally {
    db.close();
    process.exit(0);
  }
});
