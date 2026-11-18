import { parentPort, workerData } from 'worker_threads';
import path from 'node:path';
import Database from 'better-sqlite3';
import { File } from 'node-taglib-sharp';
import { updateFiles, parseMeta, markTrackWriteError } from './utility/utils.js';
import {
  ensureWritableWithStatus,
  restoreReadOnlyWindows
} from './utility/ensureWritableWithStatus';
import { sanitizeFlacPicture, sanitizeMp3Picture } from './utility/repairPictures.js';
import { findScanRoot } from './utility/scanRoots.js';

async function rescanTrack(db, track, id) {
  let writeState;
  let file;
  try {
    writeState = await ensureWritableWithStatus(track);
    if (writeState.status === 'missing') throw new Error('The audio file is missing.');
    if (writeState.status === 'locked')
      throw new Error('The audio file is locked by another application.');
    if (writeState.status === 'unwritable') throw new Error('The audio file is not writable.');

    file = File.createFromPath(track);
    const extension = path.extname(track).toLowerCase();
    if (extension === '.mp3') {
      sanitizeMp3Picture(file);
      file.save();
    } else if (extension === '.flac') {
      sanitizeFlacPicture(file);
      file.save();
    }
  } finally {
    try {
      file?.dispose();
    } finally {
      if (writeState?.hadReadOnly) await restoreReadOnlyWindows(track);
    }
  }

  const roots = db
    .prepare('SELECT root FROM roots')
    .all()
    .map((row) => row.root);
  const parsed = await parseMeta(
    [{ id: track, track_id: id }],
    'mod',
    (filePath) => findScanRoot(filePath, roots) ?? 'No root found'
  );
  const updated = updateFiles(db, parsed);
  if (!updated.success) throw new Error(updated.message);
  const rescanned = updated.files[0];
  if (!rescanned) throw new Error('The track is no longer in the music catalog.');
  return rescanned;
}

if (!parentPort) throw new Error('This module must run in a worker.');

parentPort.once('message', async (message) => {
  if (message.cmd !== 'start') {
    parentPort.close();
    return;
  }

  let db;
  const result = { id: workerData.id, processed: workerData.track, success: false };
  try {
    db = new Database(workerData.dbPath, { fileMustExist: true });
    const row = db
      .prepare('SELECT audiotrack FROM "audio-tracks" WHERE track_id = ?')
      .get(workerData.id);
    if (!row) throw new Error('The track is no longer in the music catalog.');
    result.rescanned = await rescanTrack(db, row.audiotrack, workerData.id);
    result.success = !result.rescanned.error;
    result.error = result.rescanned.error || undefined;
  } catch (error) {
    result.error = error.message;
    try {
      if (db?.open) {
        markTrackWriteError(db, workerData.id, result.error);
        result.rescanned = db
          .prepare('SELECT * FROM "audio-tracks" WHERE track_id = ?')
          .get(workerData.id);
      }
    } catch (catalogError) {
      console.error('Unable to record the rescan error:', catalogError.message);
    }
  } finally {
    try {
      db?.close();
    } finally {
      parentPort.postMessage({ type: 'completed', result });
      parentPort.close();
    }
  }
});
