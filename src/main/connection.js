import path from 'node:path';
import Database from 'better-sqlite3';

const prod = import.meta.env.PROD;
/* const isDev = import.meta.env.MODE === 'development'; */
const resourcesPath = process.resourcesPath;

const dbPath = prod
  ? path.join(resourcesPath, 'music.db' /* import.meta.env.MAIN_VITE_DB_PATH_PROD */)
  : path.join(process.cwd(), import.meta.env.MAIN_VITE_DB_PATH_DEV);

let db = null;

export function openDatabase() {
  try {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = normal');
    db.pragma('temp_store = memory');
    db.prepare('PRAGMA main.wal_checkpoint(TRUNCATE);').run();

    return db;
  } catch (err) {
    console.error('❌ Failed to open DB', err.message);
    return null;
  }
}

/* const extensionsPath = prod
  ? path.join(resourcesPath, 'extensions')
  : path.join(process.cwd(), 'src/db/extensions');

db.loadExtension(path.join(extensionsPath, 'unicode')); */

export function getDB() {
  if (!db) db = new Database(dbPath);
  return db;
}

export function closeDB() {
  return db.close();
}

process.on('exit', () => {
  try {
    if (db && db.open) {
      // ← only run if still open
      db.pragma('optimize');
      db.close();
      console.log('Database optimized and closed cleanly.');
    } else {
      console.log('DB already closed — skipping optimize/close.');
    }
  } catch (err) {
    console.error('Error during DB cleanup:', err);
  }
});

export default db;
