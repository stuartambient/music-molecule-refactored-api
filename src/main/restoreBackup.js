import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { dbPath, backupDirectory, closeDB } from './connection.js';
import { dbHealthCheck } from './dbMaintenance.js';

async function stageBackup(backup, stagedPath) {
  let source;
  let staged;
  try {
    source = new Database(backup, { readonly: true, fileMustExist: true });
    if (source.pragma('integrity_check', { simple: true }) !== 'ok' || !dbHealthCheck(source))
      return false;
    await source.backup(stagedPath);
    staged = new Database(stagedPath, { fileMustExist: true });
    staged.pragma('journal_mode = DELETE');
    return dbHealthCheck(staged);
  } catch (error) {
    console.error('Unable to use backup:', backup, error.message);
    return false;
  } finally {
    staged?.close();
    source?.close();
  }
}

export async function restoreLatestBackup() {
  let stagingDirectory;
  const moved = [];
  try {
    if (!fs.existsSync(backupDirectory)) {
      return { restored: false, error: 'Backup directory missing.' };
    }
    const backups = fs
      .readdirSync(backupDirectory)
      .filter((file) => file.startsWith('backup-') && file.endsWith('.db'))
      .sort()
      .reverse()
      .map((file) => path.join(backupDirectory, file));
    if (!backups.length) return { restored: false, error: 'No backup files found.' };

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    stagingDirectory = fs.mkdtempSync(path.join(path.dirname(dbPath), '.catalog-restore-'));
    const stagedPath = path.join(stagingDirectory, 'music.db');
    let selectedBackup;
    for (const backup of backups) {
      if (await stageBackup(backup, stagedPath)) {
        selectedBackup = backup;
        break;
      }
      for (const suffix of ['', '-wal', '-shm']) {
        if (fs.existsSync(stagedPath + suffix)) fs.unlinkSync(stagedPath + suffix);
      }
    }
    if (!selectedBackup) {
      return { restored: false, error: 'No healthy music catalog backup was found.' };
    }

    closeDB();
    const preservedPath = dbPath + '.before-restore-' + path.basename(stagingDirectory);
    for (const suffix of ['', '-wal', '-shm']) {
      const original = dbPath + suffix;
      if (fs.existsSync(original)) {
        const preserved = preservedPath + suffix;
        fs.renameSync(original, preserved);
        moved.push({ original, preserved });
      }
    }
    fs.renameSync(stagedPath, dbPath);
    return { restored: true, backup: selectedBackup, previousDatabase: moved[0]?.preserved };
  } catch (error) {
    try {
      for (const { original, preserved } of moved.reverse()) fs.renameSync(preserved, original);
    } catch (rollbackError) {
      return {
        restored: false,
        error:
          error.message + '. Restoring the previous files also failed: ' + rollbackError.message
      };
    }
    return { restored: false, error: error.message };
  } finally {
    if (stagingDirectory) {
      // Only remove files in the staging directory created by this operation.
      const stagedPath = path.join(stagingDirectory, 'music.db');
      try {
        for (const suffix of ['', '-wal', '-shm']) {
          if (fs.existsSync(stagedPath + suffix)) fs.unlinkSync(stagedPath + suffix);
        }
        fs.rmdirSync(stagingDirectory);
      } catch (error) {
        console.error('Unable to remove restore staging directory:', error.message);
      }
    }
  }
}
