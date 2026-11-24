// Test fixture: two independent handles calculate additions before either commits.
import { parentPort, workerData } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { commitScanChanges } from '../src/main/utility/scanWrites.js';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const db = new Database(workerData.dbPath);
const { kind, rows } = workerData;
const table = kind === 'files' ? '"audio-tracks"' : 'albums';
const column = kind === 'files' ? 'audiotrack' : 'fullpath';
const existing = new Set(
  db
    .prepare(`SELECT ${column} AS path FROM ${table}`)
    .all()
    .map((row) => row.path)
);
const candidates = rows.filter((row) => !existing.has(row[column]));
parentPort.postMessage({ ready: candidates.length });
parentPort.once('message', () => {
  try {
    const result = commitScanChanges(db, kind, candidates, [], (added) => {
      // Hold the write lock briefly so simultaneous attempts genuinely overlap.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 75);
      for (const row of added) {
        if (kind === 'files')
          db.prepare(
            'INSERT INTO "audio-tracks" (track_id, audiotrack, like) VALUES (?, ?, ?)'
          ).run(row.track_id, row.audiotrack, row.like);
        else
          db.prepare('INSERT INTO albums (id, fullpath, foldername) VALUES (?, ?, ?)').run(
            row.id,
            row.fullpath,
            row.foldername
          );
      }
    });
    parentPort.postMessage({ added: result.added.length });
  } finally {
    db.close();
  }
});
