import { parentPort, workerData } from 'worker_threads';
import fs from 'fs';
import process from 'node:process';
import { updateFiles, parseMeta } from './utility/utils.js';
import Database from 'better-sqlite3';

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

const run = async () => {
  let status = { modified: 0, nochange: false };
  const updatedTracks = [];
  const result = await allTracks();
  /*  console.log('all-tracks: ', result); */

  for await (const r of result) {
    if (!r) return;
    const stats = await fs.promises.stat(r.audiotrack);
    const lastModified = stats.mtimeMs;
    if (lastModified > r.modified) {
      /* console.log('lastModified > r.modified'); */
      updatedTracks.push(r);
    }
  }
  if (!updatedTracks.length) {
    /* console.log('updated tracks with no length: ', updatedTracks); */
    status.nochange = true;
    return status;
  }
  /* await parseMeta(updatedTracks).then((parsed) => triggerInsert(parsed)); */
  const moddedArray = updatedTracks.map((obj) => {
    const { audiotrack, ...rest } = obj;
    return { id: audiotrack, ...rest };
  });

  const updatedMeta = await parseMeta(moddedArray, 'mod', findRoot);
  /*   if (moddedArray) {
    console.log('modded array: ', moddedArray);
  } */
  if (updatedMeta) {
    status = { modified: updatedMeta.length, nochange: false };
  }
  await updateFiles(db, updatedMeta);
  return status;
};

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
