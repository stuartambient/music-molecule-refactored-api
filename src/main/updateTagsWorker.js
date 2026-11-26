import { parentPort, workerData } from 'worker_threads';
import process from 'node:process';
import fs from 'node:fs/promises';
import Database from 'better-sqlite3';
import updateTags from './updateTags';
import { updateFiles, parseMeta } from './utility/utils.js';
import { expectedTagValues, verifyTagValues } from './tagVerification.js';
import { runTagSaveBatch } from './tagSaveWorkflow.js';
import { forgetTagSaveJob } from './tagSaveJournal.js';
const db = new Database(workerData.workerPath, { fileMustExist: true });

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

const run = () => {
  if (workerData.mode === 'forget')
    return { status: 'success', ...forgetTagSaveJob(db, workerData.data[0]) };
  return runTagSaveBatch({
    db,
    edits: workerData.data,
    retry: workerData.mode === 'recover',
    expect: expectedTagValues,
    write: (edit) => updateTags(db, [edit], workerData.logDir),
    verify: verifyTagValues,
    parse: (files) => parseMeta(files, 'mod', findRoot),
    save: (files) => updateFiles(db, files),
    inspect: (file) => fs.stat(file)
  });
};

parentPort.on('message', async () => {
  try {
    const finalResult = await run();
    parentPort.postMessage(finalResult);
  } catch (error) {
    console.error('caught in worker end: ', error);
    parentPort.postMessage({
      status: 'error',
      message: 'Worker execution failed',
      affected: (workerData.data || [])
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
