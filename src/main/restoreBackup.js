import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { app } from 'electron';

function integrityOK(dbPath) {
  try {
    const db = new Database(dbPath);
    const result = db.prepare(`PRAGMA integrity_check`).get();
    db.close();
    return result.integrity_check === 'ok';
  } catch {
    return false;
  }
}

export function restoreLatestBackup() {
  const prod = import.meta.env.PROD;

  const backupDir = prod
    ? path.join(app.getPath('userData'), 'backups')
    : path.join(process.cwd(), import.meta.env.MAIN_VITE_DB_BACKUP_DEV, 'backups');

  const dbDir = prod ? app.getPath('userData') : path.join(process.cwd(), 'src/db');
  const dbPath = path.join(dbDir, 'music.db'); // adjust if your DB file path differs

  // 1) Locate backup directory
  if (!fs.existsSync(backupDir)) {
    return { restored: false, error: 'Backup directory missing' };
  }

  // 2) Get backup files
  const backups = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith('backup-') && f.endsWith('.db'))
    .sort() // timestamps sort lexicographically -> newest last
    .map((f) => path.join(backupDir, f));

  if (backups.length === 0) {
    return { restored: false, error: 'No backup files found' };
  }

  const newestBackup = backups[backups.length - 1];

  // 3) Close active DB if open (renderer must NOT be using it now)
  // Force close the actual shared DB connection if open
  try {
    const { getDB } = require('./connection.js'); // or import if ESM
    const liveDB = getDB && getDB();
    if (liveDB) liveDB.close();
  } catch (e) {
    console.warn('No live DB to close, continuing restore');
  }

  // 4) Move corrupted DB aside
  if (fs.existsSync(dbPath)) {
    const corruptName = `music-corrupt-${Date.now()}.db`;
    fs.renameSync(dbPath, path.join(dbDir, corruptName));
  }

  // 5) Copy backup to DB path
  fs.copyFileSync(newestBackup, dbPath);

  // 6) Remove WAL & SHM in case they exist from corrupt run
  ['music.db-wal', 'music.db-shm'].forEach((f) => {
    const p = path.join(dbDir, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });

  // 7) Verify integrity
  if (!integrityOK(dbPath)) {
    return { restored: false, error: 'Restored DB failed integrity check' };
  }

  return { restored: true, backup: newestBackup };
}
