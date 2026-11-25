import { parentPort, workerData } from 'worker_threads';
import process from 'node:process';
import Database from 'better-sqlite3';
import updateTags from './updateTags';
/* import { v4 as uuidv4 } from 'uuid'; */
/* import { File, MpegAudioFileSettings, FlacFileSettings, TagTypes } from 'node-taglib-sharp'; */
/* import decodeTagTypes from './decodeTagTypes.js'; */
/* import { flattenTagValue, getEncoderFieldsFromNative } from './tags/utils'; */
/* import { getTagInfo } from './musicMetadata'; */
import { updateFiles, parseMeta } from './utility/utils.js';
import { refreshMetadata } from './metadataRefresh.js';
/* import { parseMeta } from './utility'; */
/* console.log('worker path: ', path.join(workerData.workerPath, 'music.db')); */
const db = new Database(workerData.workerPath, { fileMustExist: true });

const createRootsTable = `CREATE TABLE IF NOT EXISTS roots ( id INTEGER PRIMARY KEY AUTOINCREMENT, root TEXT UNIQUE)`;
db.exec(createRootsTable);

let newestRoots;
const getRoots = () => {
  const roots = db.prepare('SELECT root FROM roots');

  newestRoots = roots.all().map((row) => row.root);
};

getRoots();

export function getRow(rowId) {
  const row = db.prepare(`SELECT albumArtists,
                                 album,
                                 beatsPerMinute,
                                 composers,
                                 conductor,
                                 copyright,
                                 comment,
                                 disc,
                                 discCount,
                                 description,
                                 genres,
                                 isCompilation,
                                 isrc,
                                 lyrics,
                                 performers,
                                 pictures,
                                 publisher,
                                 remixedBy,
                                 replayGainAlbumGain,
                                 replayGainAlbumPeak,
                                 replayGainTrackGain,
                                 replayGainTrackPeak,
                                 title,
                                 track,
                                 trackCount,
                                 year,
                                 encoder,
                                 encoderSettings,
                                 encodedBy FROM "audio-tracks" WHERE track_id = ?`);
  const rowData = row.get(rowId);
  return rowData;
}

const findRoot = (file) => {
  for (const root of newestRoots) {
    if (file.startsWith(root)) {
      return root;
    }
  }
  return 'No root found';
};

async function runSequentially(originalData) {
  const data = originalData.filter(Boolean);
  const tagResult = await updateTags(db, data, workerData.logDir);
  const { res, failed: refreshFailures } = await refreshMetadata(data, {
    parse: (files) => parseMeta(files, 'mod', findRoot),
    save: (files) => updateFiles(db, files)
  });
  const failures = new Map((tagResult.errors || []).map((file) => [file.track_id, file]));
  for (const file of refreshFailures) failures.set(file.track_id, file);
  const failed = [...failures.values()];
  const passed = data
    .filter((file) => !failures.has(file.track_id))
    .map((file) => ({ track_id: file.track_id, track: file.id }));
  return {
    status: failed.length ? (passed.length ? 'partial_status' : 'failed') : 'success',
    passed,
    failed,
    res
  };
}

parentPort.on('message', async () => {
  try {
    const finalResult = await runSequentially(workerData.data);
    parentPort.postMessage(finalResult);
  } catch (error) {
    console.error('caught in worker end: ', error);
    parentPort.postMessage({
      status: 'error',
      message: 'Worker execution failed',
      affected: workerData.data
        .filter(Boolean)
        .map((file) => ({ track_id: file.track_id, id: file.id })),
      error: error instanceof Error ? error.message : String(error),
      stack: error?.stack || null
    });
  } finally {
    db.close();
    process.exit(0);
  }
});
