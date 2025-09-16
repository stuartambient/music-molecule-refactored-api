/* eslint-disable no-useless-escape */
import { parentPort, workerData } from 'worker_threads';
import path from 'node:path';
import process from 'node:process';
import fg from 'fast-glob';
import Database from 'better-sqlite3';
/* import { v4 as uuidv4 } from 'uuid'; */
/* import { File, MpegAudioFileSettings, FlacFileSettings, TagTypes } from 'node-taglib-sharp'; */
/* import decodeTagTypes from './decodeTagTypes.js'; */
import { fileExtensions } from '../constant/constants.js';
/* import { getTagInfo } from './musicMetadata.js'; */
/* import { flattenTagValue, getEncoderFieldsFromNative } from './tags/utils.js'; */
import { insertFiles, parseMeta } from './utility/utils.js';

const mode = import.meta.env.MODE;
const dbPath =
  mode === 'development'
    ? path.join(process.cwd(), import.meta.env.MAIN_VITE_DB_PATH_DEV)
    : path.join(workerData, 'music.db');

const db = new Database(dbPath);
const createRootsTable = `CREATE TABLE IF NOT EXISTS roots ( id INTEGER PRIMARY KEY AUTOINCREMENT, root TEXT UNIQUE)`;
db.exec(createRootsTable);

let newestRoots;
const getRoots = () => {
  const roots = db.prepare('SELECT root FROM roots');

  newestRoots = roots.all().map((row) => row.root);
};

getRoots();

export function findRoot(file) {
  for (const root of newestRoots) {
    if (file.startsWith(root)) {
      return root;
    }
  }
  return 'No root found';
}

const getFiles = () => {
  /* console.log('getFiles'); */
  const allFiles = db.prepare('SELECT audiotrack FROM "audio-tracks"');
  const files = allFiles.all();
  return files;
};

const deleteFiles = (files) => {
  const deleteFile = db.prepare('DELETE FROM "audio-tracks" WHERE audiotrack = ?');

  const deleteMany = db.transaction((files) => {
    for (const f of files) deleteFile.run(f);
  });

  deleteMany(files);
};

const difference = (setA, setB) => {
  const _difference = new Set(setA);
  for (const elem of setB) {
    _difference.delete(elem);
  }
  return _difference;
};

const compareDbRecords = async (files) => {
  const status = { new: '', deleted: '', nochange: false };
  const dbFiles = getFiles();
  const dbAll = dbFiles.map((d) => d.audiotrack);

  const allfiles = new Set(files);
  const dbentries = new Set(dbAll);

  const newEntries = Array.from(difference(allfiles, dbentries));
  const missingEntries = Array.from(difference(dbentries, allfiles));

  if (newEntries.length > 0) {
    await parseMeta(newEntries, 'new', findRoot)
      .then((parsed) => insertFiles(db, parsed))
      .then((message) => {
        if (message) {
          status.new = newEntries;
        } else {
          console.error('Insertion failed with message:', message);
        }
      })
      .catch((error) => {
        console.error('Error in processing:', error);
      });
  }

  if (missingEntries.length > 0) {
    deleteFiles(missingEntries);
    status.deleted = missingEntries;
  }
  if (!newEntries.length && !missingEntries.length) {
    status.nochange = true;
  }
  return status;
};

function escapeSpecialChars(path) {
  return path.replace(/[\[\]\(\)]/g, '\\$&');
}

const glob = async (patterns) => {
  const escapedPatterns = patterns.map(escapeSpecialChars);
  const entries = await fg(escapedPatterns, {
    caseSensitiveMatch: false,
    suppressErrors: true,
    dot: true
  })
    .then((e) => e)
    .catch((e) => console.error('fg error: ', e.message));

  return entries;
};

const runFiles = async (newestRoots, cb) => {
  const patterns = newestRoots.map((root) => `${root}/**/*.${fileExtensions}`);
  await glob(patterns)
    .catch((e) => console.log('error reading: ', e.message))
    .then((allfiles) => compareDbRecords(allfiles))
    .then((prepared) => cb(prepared));
};

const processFiles = async () => {
  return new Promise((resolve, reject) => {
    try {
      runFiles(newestRoots, (result) => {
        resolve(result);
      });
    } catch (error) {
      reject(error);
    }
  });
};

if (!parentPort) throw Error('IllegalState');
parentPort.on('message', async (message) => {
  console.log('parent port message: ', message);
  try {
    const result = await processFiles(message);
    /* const result = addTwoNums(2, 3); */
    parentPort.postMessage({ result });
  } catch (error) {
    parentPort.postMessage({ error: error.message });
  }
});
