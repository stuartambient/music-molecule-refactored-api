import fs from 'node:fs';
import path from 'node:path';
import { paths } from './paths.js';
import Database from 'better-sqlite3';

export const dbPath = import.meta.env.PROD
  ? paths.db
  : path.resolve(process.cwd(), import.meta.env.MAIN_VITE_DB_PATH_DEV || 'src/db/music.db');

export const backupDirectory = import.meta.env.PROD
  ? paths.backups
  : path.resolve(process.cwd(), import.meta.env.MAIN_VITE_DB_BACKUP_DEV || 'src/db', 'backups');

let db = null;

export function openDatabase() {
  if (db?.open) return db;

  let opened;
  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    opened = new Database(dbPath);
    opened.pragma('journal_mode = WAL');
    opened.pragma('synchronous = normal');
    opened.pragma('temp_store = memory');
    db = opened;
    return db;
  } catch (error) {
    opened?.close();
    db = null;
    throw error;
  }
}

export function getDB() {
  if (!db?.open) throw new Error('The music database is not open.');
  return db;
}

export function closeDB() {
  if (db?.open) db.close();
  db = null;
}

process.on('exit', () => {
  try {
    if (db?.open) db.pragma('optimize');
  } catch (error) {
    console.error('Database optimization failed:', error);
  } finally {
    closeDB();
  }
});

// Keep existing query modules connected to the current handle after recovery.
export { db as default };
