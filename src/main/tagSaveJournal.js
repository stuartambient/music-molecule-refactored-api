import { createHash } from 'node:crypto';

const revision = (row) =>
  createHash('sha256')
    .update(
      JSON.stringify([row.file_path, row.expected_json, row.phase, row.error, row.updated_at])
    )
    .digest('hex');
const tableExists = (db) =>
  Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='tag_save_jobs'").get()
  );
export function listTagSaveJobs(db) {
  if (!tableExists(db)) return [];
  return db
    .prepare('SELECT * FROM tag_save_jobs ORDER BY updated_at, track_id')
    .all()
    .map((row) => ({
      track_id: row.track_id,
      id: row.file_path,
      expected: JSON.parse(row.expected_json),
      revision: revision(row),
      phase: row.phase,
      error: row.error
    }));
}
export const pendingTagSaveSummary = (db) =>
  listTagSaveJobs(db).map(({ track_id, id, phase, error, revision }) => ({
    track_id,
    id,
    phase,
    error,
    revision
  }));
export function createTagSaveJournal(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS tag_save_jobs (
    track_id TEXT PRIMARY KEY, file_path TEXT NOT NULL, expected_json TEXT NOT NULL,
    phase TEXT NOT NULL, error TEXT, updated_at TEXT NOT NULL
  )`);
  const put =
    db.prepare(`INSERT INTO tag_save_jobs (track_id, file_path, expected_json, phase, error, updated_at)
    VALUES (@track_id, @id, @expected, 'pending', NULL, @now)
    ON CONFLICT(track_id) DO UPDATE SET file_path=excluded.file_path, expected_json=excluded.expected_json,
      phase='pending', error=NULL, updated_at=excluded.updated_at`);
  return {
    begin: (edit, expected) =>
      put.run({
        track_id: edit.track_id,
        id: edit.id,
        expected: JSON.stringify(expected),
        now: new Date().toISOString()
      }),
    finish: (id) => db.prepare('DELETE FROM tag_save_jobs WHERE track_id=?').run(id),
    failed: (id, error) =>
      db
        .prepare(
          "UPDATE tag_save_jobs SET phase='incomplete', error=?, updated_at=? WHERE track_id=?"
        )
        .run(error, new Date().toISOString(), id)
  };
}

// Forget only the exact record the user reviewed, including when the catalog/file is gone.
export function forgetTagSaveJob(db, request) {
  if (!tableExists(db)) return { removed: false, pending: [] };
  return db
    .transaction(() => {
      const row = db.prepare('SELECT * FROM tag_save_jobs WHERE track_id=?').get(request.track_id);
      if (row && revision(row) !== request.revision)
        throw new Error(
          'This unfinished save changed. Review the current record before forgetting it.'
        );
      const removed = row
        ? db.prepare('DELETE FROM tag_save_jobs WHERE track_id=?').run(request.track_id).changes > 0
        : false;
      return { removed, pending: pendingTagSaveSummary(db) };
    })
    .immediate();
}
