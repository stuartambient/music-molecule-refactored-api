import { parentPort, workerData } from 'worker_threads';
import path from 'node:path';
import Database from 'better-sqlite3';
import { File } from 'node-taglib-sharp';
import { updateFiles, parseMeta } from './utility/utils.js';
import { sanitizeFlacPicture, sanitizeMp3Picture } from './utility/repairPictures.js';

const mode = import.meta.env.MODE;
const dbPath =
  mode === 'development'
    ? path.join(process.cwd(), import.meta.env.MAIN_VITE_DB_PATH_DEV)
    : path.join(workerData.workerPath, 'music.db');

const db = new Database(dbPath);

let newestRoots;
const getRoots = () => {
  const roots = db.prepare('SELECT root FROM roots');

  newestRoots = roots.all().map((row) => row.root);
};

getRoots();

function getRescannedTrack(id) {
  const track = db.prepare(`SELECT * FROM "audio-tracks" WHERE track_id = ?`);
  return track.get(id);
}

export function findRoot(file) {
  for (const root of newestRoots) {
    if (file.startsWith(root)) {
      return root;
    }
  }
  return 'No root found';
}

const processTrack = async (track, id, result) => {
  let myFile = File.createFromPath(track);
  if (path.extname(track).toLowerCase() === '.mp3') {
    sanitizeMp3Picture(myFile);
    myFile.save();
    myFile.dispose();
  } else if (path.extname(track).toLowerCase() === '.flac') {
    sanitizeFlacPicture(myFile);
    myFile.save();
    myFile.dispose();
  }
  const parseMetadata = await parseMeta([{ id: track, track_id: id }], 'mod', findRoot);
  const updateDb = updateFiles(db, parseMetadata);
  if (updateDb.success === true) {
    const rescanned = getRescannedTrack(id);
    result.rescanned = rescanned;
  }
};

if (!parentPort) {
  console.error('-----');
  throw new Error('IllegalState');
}

parentPort.on('message', async (msg) => {
  if (msg.cmd === 'start') {
    const result = { processed: workerData.track, sucess: true, rescanned: {} };

    try {
      await processTrack(workerData.track, workerData.id, result);
    } catch (err) {
      parentPort.postMessage({ type: 'fatal', error: err.message });
      return;
    }
    parentPort.postMessage({ type: 'completed', result });
    // no exit() — let it drain naturally
  }
});
