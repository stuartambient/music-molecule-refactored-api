import { parentPort, workerData } from 'worker_threads';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  File,
  /*   Id3v2TextInformationFrame,
  Id3v2Tag,
  Id3v1Tag, */
  MpegAudioFileSettings,
  TagTypes
} from 'node-taglib-sharp';
import decodeTagTypes from './decodeTagTypes.js';
import { inspectTags, extraneousTags } from './tag-inspector.js';
/* import { extractPresentFields } from './tags/index.js'; */

const mode = import.meta.env.MODE;
const dbPath =
  mode === 'development'
    ? path.join(process.cwd(), import.meta.env.MAIN_VITE_DB_PATH_DEV)
    : path.join(workerData.workerPath, 'music.db');

const db = new Database(dbPath);
/* console.log(db); */

// prepared statements
/* const selectSQL = ; */

const selectStmt = db.prepare(
  `SELECT audiotrack
   FROM "audio-tracks"
   WHERE root = ? AND tagTypes IS NULL
   LIMIT ?`
);
const updateStmt = db.prepare(`UPDATE "audio-tracks" SET tagTypes = ? WHERE audiotrack = ?`);

// optional: wrap updates in a transaction for speed
MpegAudioFileSettings.defaultTagTypes = TagTypes.Id3v2;
const updateMany = db.transaction((rows) => {
  for (const { audiotrack } of rows) {
    let f;
    try {
      f = File.createFromPath(audiotrack);

      const joined = decodeTagTypes(f.tag.tagTypes >>> 0).join(', ');
      updateStmt.run(joined, audiotrack);
      // No changes -> no save()
    } catch (e) {
      console.error('updateMany error:', e, 'file:', audiotrack);
    } finally {
      try {
        f?.dispose();
      } catch (e) {
        console.error(e.message);
      }
    }
  }
});

async function cleanTag(rows) {
  for (const { audiotrack } of rows) {
    let f;
    try {
      f = File.createFromPath(audiotrack);
      const info = await inspectTags(f); // your helper that reads fileType + typesList
      const removeMask = await extraneousTags(info.fileType, info.typesList);
      if (removeMask) {
        f.removeTags(removeMask);
        f.save();
      }
    } catch (e) {
      console.error('cleanTag error:', e, 'file:', audiotrack);
      // continue to next file
    } finally {
      try {
        f?.dispose();
      } catch (error) {
        console.error(error.message);
      }
    }
  }
  return true; // after the loop completes
}

async function processBatch(limit) {
  console.log('limit:', limit);
  // ensure integer
  const rows = selectStmt.all('I:/music', limit | 0);
  if (!rows.length) return;

  // 1) clean first (await!)
  const cleaned = await cleanTag(rows);

  // 2) only then read tag types back into DB
  if (cleaned) {
    updateMany(rows);
  }

  parentPort?.postMessage({ processed: rows.length });
  return rows.length;
}

function run() {
  const n = processBatch(workerData.batchSize);
  if (n === 0) {
    parentPort?.postMessage({ done: true });
  }
}

if (!parentPort) {
  console.error('-----');
  throw new Error('IllegalState');
}
parentPort.on('message', () => {
  // you don’t need the message for config; just start
  run();
});
