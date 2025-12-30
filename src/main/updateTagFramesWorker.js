import { parentPort, workerData } from 'worker_threads';
import path from 'node:path';
import Database from 'better-sqlite3';
import { File } from 'node-taglib-sharp';
import { sanitizeFlacPicture, sanitizeMp3Picture } from './utility/repairPictures.js';

/* import { extractPresentFields } from './tags/index.js'; */

const mode = import.meta.env.MODE;
const dbPath =
  mode === 'development'
    ? path.join(process.cwd(), import.meta.env.MAIN_VITE_DB_PATH_DEV)
    : path.join(workerData.workerPath, 'music.db');

const db = new Database(dbPath);

const UPDATABLE_COLUMNS = new Set([
  'performers',
  'error'
  // add more as needed
]);

function updateTrackColumn({ column, value, audiotrack }) {
  if (!UPDATABLE_COLUMNS.has(column)) {
    throw new Error(`Invalid column update attempted: ${column}`);
  }

  const stmt = db.prepare(`
    UPDATE "audio-tracks"
    SET "${column}" = ?
    WHERE audiotrack = ?
    LIMIT 1
  `);

  return stmt.run(value, audiotrack);
}

/* function updatePerformers(performers, audiotrack) {
  const stmt = db.prepare(`
    UPDATE "audio-tracks"
    SET performers = ?
    WHERE audiotrack = ?
    LIMIT 1`);

  return stmt.run(performers, audiotrack);
} */

function performersWithSemicolons(limit) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 1000;
  const stmt = db.prepare(`
    SELECT audiotrack,performers
    FROM "audio-tracks"
    WHERE performers IS NOT NULL
      AND performers LIKE '%;%'
    LIMIT ?
  `);

  return stmt.all(safeLimit);
}

function processFiles(files, stats) {
  for (const file of files) {
    const normalized = file.performers.replaceAll(';', ',');
    const audiotrack = file.audiotrack;

    try {
      let myFile = File.createFromPath(file.audiotrack);
      if (path.extname(file.audiotrack).toLowerCase() === '.mp3') {
        sanitizeMp3Picture(myFile);
        myFile.save();
      } else if (path.extname(file.audiotrack).toLowerCase() === '.flac') {
        sanitizeFlacPicture(myFile);
        myFile.save();
      }
      myFile.tag.performers = normalized.split(',').map((s) => s.trim());
      myFile.save();
      myFile.dispose();
      myFile = File.createFromPath(file.audiotrack);
      const upd = updateTrackColumn({
        column: 'performers',
        value: myFile.tag.performers.join(', '),
        audiotrack
      });
      if (upd.changes === 1) {
        stats.processed++;
      } else {
        stats.failed++;
      }
      myFile.dispose();
    } catch (err) {
      console.error('performers backfill error: ', audiotrack);
      /* stats.failedFiles.push({ track: file.audiotrack, error: err }); */
      const upd = updateTrackColumn({
        column: 'error',
        value: err.toString(),
        audiotrack
      });
      if (upd.changes === 1) {
        stats.failed++;
      }
    }
  }
}

async function getFiles(limit, stats) {
  stats.total = 0;
  stats.processed = 0;
  stats.failed = 0;

  const semicolonDelimeters = performersWithSemicolons(limit);

  if (semicolonDelimeters.length === 0) {
    return;
  }

  stats.total = semicolonDelimeters.length;

  processFiles(semicolonDelimeters, stats);
}

if (!parentPort) {
  console.error('-----');
  throw new Error('IllegalState');
}

parentPort.on('message', async (msg) => {
  if (msg.cmd === 'start') {
    const stats = { processed: 0, failed: 0 };

    try {
      await getFiles(workerData.batchSize, stats);
    } catch (err) {
      parentPort.postMessage({ type: 'fatal', error: err.message });
      return;
    }
    parentPort.postMessage({ type: 'completed', stats });
    // no exit() — let it drain naturally
  }
});
