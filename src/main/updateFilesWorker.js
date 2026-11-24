import { parentPort, workerData } from 'worker_threads';
import path from 'node:path';
import { readdir } from 'node:fs';
import process from 'node:process';
import fg from 'fast-glob';
import Database from 'better-sqlite3';
import { fileExtensions } from '../constant/constants.js';
import { insertFiles, parseMeta } from './utility/utils.js';
import { findScanRoot, scanRoots } from './utility/scanRoots.js';
import { commitScanChanges } from './utility/scanWrites.js';

const mode = import.meta.env.MODE;
const dbPath =
  mode === 'development'
    ? path.join(process.cwd(), import.meta.env.MAIN_VITE_DB_PATH_DEV)
    : workerData;

const db = new Database(dbPath);
const createRootsTable = `CREATE TABLE IF NOT EXISTS roots ( id INTEGER PRIMARY KEY AUTOINCREMENT, root TEXT UNIQUE)`;
db.exec(createRootsTable);

let newestRoots;
const getRoots = () => {
  const roots = db.prepare('SELECT root FROM roots');

  newestRoots = roots.all().map((row) => row.root);
};

getRoots();

const findRoot = (file) => findScanRoot(file, newestRoots) ?? 'No root found';

const getFiles = () => {
  /* console.log('getFiles'); */
  const allFiles = db.prepare('SELECT audiotrack FROM "audio-tracks"');
  const files = allFiles.all();
  return files;
};

async function listFiles(root) {
  const files = await fg(`**/*.${fileExtensions}`, {
    cwd: root,
    caseSensitiveMatch: false,
    dot: true,
    fs: {
      // fast-glob ignores ENOENT by default, including directories lost mid-scan.
      readdir(directory, ...args) {
        const callback = args.pop();
        readdir(directory, ...args, (error, entries) => {
          callback(error ? new Error(error.message, { cause: error }) : null, entries);
        });
      }
    }
  });
  return files.map((file) => path.join(root, file).split(path.sep).join('/'));
}

async function processFiles() {
  const scan = await scanRoots(newestRoots, listFiles);
  const { added, missing } = scan.compare(getFiles().map((row) => row.audiotrack));

  const parsed = added.length ? await parseMeta(added, 'new', findRoot) : [];
  const committed = commitScanChanges(db, 'files', parsed, missing, (rows) => {
    const result = insertFiles(db, rows);
    if (!result.success) throw new Error(result.message);
  });

  return {
    new: committed.added.map((row) => row.audiotrack),
    deleted: committed.deleted,
    nochange: !committed.added.length && !committed.deleted.length,
    skippedRoots: scan.skippedRoots
  };
}

if (!parentPort) throw Error('IllegalState');
parentPort.on('message', async () => {
  try {
    const result = await processFiles();
    parentPort.postMessage({ result });
  } catch (error) {
    parentPort.postMessage({ error: error.message });
  } finally {
    db.close();
    process.exit(0);
  }
});
