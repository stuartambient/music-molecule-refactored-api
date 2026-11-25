import { parentPort, workerData } from 'worker_threads';
import fs from 'fs';
import process from 'node:process';
import { updateFiles, parseMeta } from './utility/utils.js';
import Database from 'better-sqlite3';
import { updateChangedMetadata } from './metadataRefresh.js';

const db = new Database(workerData, { fileMustExist: true });
const createRootsTable = `CREATE TABLE IF NOT EXISTS roots ( id INTEGER PRIMARY KEY AUTOINCREMENT, root TEXT UNIQUE)`;
db.exec(createRootsTable);

let newestRoots;
const getRoots = () => {
  const roots = db.prepare('SELECT root FROM roots');

  newestRoots = roots.all().map((row) => row.root);
};

getRoots();

const findRoot = (file) => {
  for (const root of newestRoots) {
    if (file.startsWith(root)) {
      return root;
    }
  }
  return 'No root found';
};

const allTracks = () => {
  const alltracks = db.prepare('SELECT track_id, audiotrack, modified FROM "audio-tracks"');
  const tracks = alltracks.all();
  return tracks;
};

const run = () =>
  updateChangedMetadata(allTracks(), {
    stat: (file) => fs.promises.stat(file),
    parse: (files) => parseMeta(files, 'mod', findRoot),
    save: (files) => updateFiles(db, files)
  });

if (!parentPort) throw Error('IllegalState');
parentPort.on('message', async (message) => {
  console.log('message: ', message);
  try {
    const result = await run();
    console.log('meta worker result: ', result);
    parentPort.postMessage({ result });
  } catch (error) {
    parentPort.postMessage({ error: error.message || String(error) });
  } finally {
    db.close();
    process.exit(0);
  }
});
