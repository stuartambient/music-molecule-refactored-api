import Database from 'better-sqlite3';
import { openDatabase, closeDB, dbPath } from './connection.js';
import { initializeDatabase } from './sql.js';
import { dbDiagnosticRepair, dbHealthCheck } from './dbMaintenance.js';

export function initializeCatalog() {
  try {
    const db = openDatabase();
    const integrity = db.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error('Database integrity check failed: ' + integrity);

    initializeDatabase();
    if (!dbHealthCheck(db)) throw new Error('The music catalog could not be initialized.');
    return { ok: true };
  } catch (error) {
    closeDB();
    return { ok: false, error: error.message };
  }
}

export function repairCatalog() {
  let repairDB;
  try {
    closeDB();
    repairDB = new Database(dbPath, { fileMustExist: true });
    if (!dbDiagnosticRepair(repairDB)) {
      return {
        fixed: false,
        error: 'The catalog could not be repaired. Restore a backup to continue.'
      };
    }
  } catch (error) {
    return { fixed: false, error: error.message };
  } finally {
    repairDB?.close();
  }

  const status = initializeCatalog();
  return { fixed: status.ok, error: status.error };
}
