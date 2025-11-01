export function dbHealthCheck(db) {
  try {
    // Quick structural check
    const quick = db.prepare('PRAGMA quick_check').get();
    if (quick.quick_check !== 'ok') {
      console.warn('DB quick_check failed:', quick);
      return false;
    }

    // Verify critical tables exist
    const requiredTables = ['audio-tracks', 'albums', 'roots'];
    const existing = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all()
      .map((r) => r.name);

    for (const table of requiredTables) {
      if (!existing.includes(table)) {
        console.warn(`DB missing table: ${table}`);
        return false;
      }
    }

    // Light sanity read
    db.prepare('SELECT 1').get();

    return true;
  } catch (err) {
    console.error('DB health check error:', err);
    return false;
  }
}

export function dbDiagnosticRepair(db) {
  try {
    console.warn('Running deep DB diagnostic...');

    // Full integrity check
    const integrity = db.prepare('PRAGMA integrity_check').get();
    if (integrity.integrity_check !== 'ok') {
      console.error('Integrity check failed:', integrity);
    }

    // Rebuild indexes — fixes many logical issues
    try {
      db.exec('REINDEX;');
    } catch (e) {
      console.error('REINDEX failed:', e);
    }

    // Flush and rebuild WAL
    try {
      db.prepare('PRAGMA wal_checkpoint(FULL)').run();
    } catch (e) {
      console.error('WAL checkpoint failed:', e);
    }

    // VACUUM — rebuild database file
    try {
      db.exec('VACUUM;');
    } catch (e) {
      console.error('VACUUM failed:', e);
    }

    // Update SQLite planner statistics
    try {
      db.prepare('PRAGMA optimize').run();
    } catch (e) {
      console.error('Optimize failed:', e);
    }

    // Re-check
    const post = db.prepare('PRAGMA quick_check').get();
    const ok = post.quick_check === 'ok';

    if (ok) {
      console.log('DB diagnostic complete — database repaired.');
      return true;
    } else {
      console.error('DB diagnostic could not repair database.');
      return false;
    }
  } catch (err) {
    console.error('DB diagnostic error:', err);
    return false;
  }
}
