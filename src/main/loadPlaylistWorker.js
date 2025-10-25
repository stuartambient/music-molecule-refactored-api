import { parentPort, workerData } from 'worker_threads';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
/* import fg from 'fast-glob'; */
import Database from 'better-sqlite3';

const mode = import.meta.env.MODE;
const dbPath =
  mode === 'development'
    ? path.join(process.cwd(), import.meta.env.MAIN_VITE_DB_PATH_DEV)
    : path.join(workerData, 'music.db');

const db = new Database(dbPath);
const createRootsTable = `CREATE TABLE IF NOT EXISTS roots ( id INTEGER PRIMARY KEY AUTOINCREMENT, root TEXT UNIQUE)`;
db.exec(createRootsTable);

const getPlaylist = (playlist) => {
  /* console.log('playlist: ', playlist); */
  if (!playlist || playlist.length === 0) {
    console.log('Empty playlist');
    return [];
  }

  const albumFiles = [];
  const plfile = db.prepare(
    'SELECT track_id, like, audiotrack, performers, title, album FROM "audio-tracks" WHERE audiotrack = ?'
  );

  playlist.forEach((pl) => {
    try {
      const file = plfile.get(pl);
      if (file) {
        albumFiles.push(file);
      } else {
        console.warn(`File for audiotrack ${pl} not found in the database.`);
      }
    } catch (error) {
      console.error(`Error retrieving audiotrack ${pl}:`, error);
    }
  });
  console.log(albumFiles);
  return albumFiles;
};

async function normalizePaths(paths) {
  /* console.log('paths: ', paths); */
  const plfiles = await fsPromises.readFile(paths.join(), 'utf8');
  const parsed = plfiles.replaceAll('\\', '/').split('\n');
  return getPlaylist(parsed);
}

if (!parentPort) throw Error('IllegalState');
parentPort.on('message', async () => {
  try {
    const paths = await normalizePaths(workerData.data);
    parentPort.postMessage({ data: paths });
  } catch (error) {
    parentPort.postMessage({ error: error.message });
  }
});
