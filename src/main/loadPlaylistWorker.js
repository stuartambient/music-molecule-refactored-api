import { parentPort, workerData } from 'worker_threads';

import path from 'node:path';
import process from 'node:process';
import { promises as fsPromises } from 'node:fs';
/* import fg from 'fast-glob'; */
import Database from 'better-sqlite3';

const mode = import.meta.env.MODE;
const dbPath =
  mode === 'development'
    ? path.join(process.cwd(), import.meta.env.MAIN_VITE_DB_PATH_DEV)
    : path.join(workerData.workerPath, 'music.db');

const db = new Database(dbPath);
/* const createRootsTable = `CREATE TABLE IF NOT EXISTS roots ( id INTEGER PRIMARY KEY AUTOINCREMENT, root TEXT UNIQUE)`;
db.exec(createRootsTable); */

const getPlaylist = (playlist) => {
  if (!playlist?.length) return [];

  // Filter out empty lines and duplicates
  const cleaned = playlist.filter(Boolean);

  // Build a single SQL query
  const placeholders = cleaned.map(() => '?').join(',');
  const query = `
    SELECT track_id, like, audiotrack, performers, title, album
    FROM "audio-tracks"
    WHERE audiotrack IN (${placeholders})
  `;

  const stmt = db.prepare(query);
  const rows = stmt.all(...cleaned);

  // Optionally, preserve playlist order (SQLite IN() doesn’t guarantee it)
  const map = new Map(rows.map((r) => [r.audiotrack, r]));
  const ordered = cleaned.map((path) => map.get(path)).filter(Boolean);

  return ordered;
};

async function normalizePaths(input) {
  const paths = Array.isArray(input) ? input : input.data;
  const plfiles = await fsPromises.readFile(paths[0], 'utf8');
  const parsed = plfiles.replaceAll('\\', '/').split('\n');
  return getPlaylist(parsed);
}

if (!parentPort) throw Error('IllegalState');
parentPort.on('message', async () => {
  try {
    const { data } = workerData;
    const paths = await normalizePaths(data);
    parentPort.postMessage({ data: paths });
  } catch (error) {
    parentPort.postMessage({ error: error.message });
  }
});
