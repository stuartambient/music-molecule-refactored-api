import path from 'node:path';
import { paths } from './paths.js';
import Database from 'better-sqlite3';

const prod = import.meta.env.PROD;
/* const isDev = import.meta.env.MODE === 'development'; */
const resourcesPath = paths.resources;

const dbPath = prod ? paths.db : path.join(process.cwd(), import.meta.env.MAIN_VITE_DB_PATH_DEV);

const db = new Database(dbPath /* , { verbose: console.log } */);

db.pragma('journal_mode = WAL');
db.pragma('synchronous = normal');
db.pragma('temp_store = memory');
db.prepare('PRAGMA main.wal_checkpoint(TRUNCATE);').run();

const extensionsPath = prod
  ? path.join(resourcesPath, 'extensions')
  : path.join(process.cwd(), 'src/db/extensions');

db.loadExtension(path.join(extensionsPath, 'unicode'));

process.on('exit', () => {
  try {
    db.pragma('optimize'); // safe: quick, sync
    db.close(); // safe: sync
    console.log('Database optimized and closed cleanly.');
  } catch (err) {
    console.error('Error during DB cleanup:', err);
  }
});

export default db;
