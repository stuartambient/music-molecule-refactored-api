import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { paths } from './paths.js';

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
    ? paths.backups
    : path.join(process.cwd(), import.meta.env.MAIN_VITE_DB_BACKUP_DEV, 'backups');

  const dbDir = prod
    ? paths.local
    : path.join(process.cwd(), import.meta.env.MAIN_VITE_DB_BACKUP_DEV);
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
  try {
    Database(dbPath).close();
  } catch {}

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
