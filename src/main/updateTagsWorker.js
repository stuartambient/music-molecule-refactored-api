import { parentPort, workerData } from 'worker_threads';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';
import updateTags from './updateTags';
/* import { v4 as uuidv4 } from 'uuid'; */
/* import { File, MpegAudioFileSettings, FlacFileSettings, TagTypes } from 'node-taglib-sharp'; */
/* import decodeTagTypes from './decodeTagTypes.js'; */
/* import { flattenTagValue, getEncoderFieldsFromNative } from './tags/utils'; */
/* import { getTagInfo } from './musicMetadata'; */
import { updateFiles, parseMeta } from './utility/utils.js';
/* import { parseMeta } from './utility'; */
/* console.log('worker path: ', path.join(workerData.workerPath, 'music.db')); */
const mode = import.meta.env.MODE;
const dbPath =
  mode === 'development'
    ? path.join(process.cwd(), import.meta.env.MAIN_VITE_DB_PATH_DEV)
    : workerData.workerPath;

const db = new Database(dbPath);

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

function classifyUpdateResults(updatedArray, failedArray) {
  /*  console.log('UA: ', updatedArray, 'FA: ', failedArray); */
  const failedIdSet = new Set(failedArray.map((f) => f.track_id));

  let failedCount = 0;

  for (const item of updatedArray) {
    if (failedIdSet.has(item.track_id)) {
      failedCount++;
    }
  }

  return {
    failedCount,
    total: updatedArray.length,
    allFailed: failedCount === updatedArray.length,
    noneFailed: failedCount === 0,
    mixed: failedCount > 0 && failedCount < updatedArray.length
  };
}

async function func1(data) {
  try {
    const updateTagsResult = await updateTags(db, data, workerData.logDir);
    /* console.log('updateTagsResult: ', updateTagsResult); */

    const updatedArray = data.filter((obj) => obj);
    const failedArray = updateTagsResult.errors;
    /* console.log('failedArray: ', failedArray); */

    const updateResults = classifyUpdateResults(updatedArray, failedArray);

    /* console.log('updateResults: ', updateResults); */

    if (updateResults.failedCount === 0) {
      return { status: 'success', updatedArray };
    } else if (updateResults.allFailed === true) {
      return { status: 'failed', updatedArray, failedArray };
    } else if (updateResults.mixed === true) {
      return { status: 'partial_success', updatedArray, failedArray };
    }
  } catch (error) {
    console.error('error in func1: ', error);
    // return { status: 'error', error: error instanceof Error ? error.message : String(error) };
  }
}

async function func2(input) {
  return new Promise((resolve, reject) => {
    try {
      const updatedMeta = parseMeta(input, 'mod', findRoot);
      resolve(updatedMeta);
    } catch (error) {
      console.log('func2 error: ', error);
      reject(error);
    }
  });
}

async function func3(input, errorArray) {
  return new Promise((resolve, reject) => {
    try {
      const updateMessage = updateFiles(db, input, errorArray);
      /* console.log('sql updateMessage: ', updateMessage); */
      resolve(updateMessage);
    } catch (error) {
      reject(error);
    }
  });
}

async function runSequentially(originalData) {
  const result1 = await func1(originalData);
  /*  console.log('result1: ', result1); */

  const result2 = await func2(result1.updatedArray);

  const result3 = await func3(result2, result1.failedArray);

  const passed = result1.updatedArray.map((file) => ({ track_id: file.track_id, track: file.id }));
  const failed = result1.failedArray;

  if (result1.status === 'success') {
    return { status: 'success', passed, res: result3 /* updatedRows: result3.files */ };
  } else if (result1.status === 'failed') {
    return { status: 'failed', passed, failed, res: result3 };
  } else if (result1.status === 'partial_success') {
    return { status: 'partial_status', passed, failed, res: result3 };
  }
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
      error: error instanceof Error ? error.message : String(error),
      stack: error?.stack || null
    });
  } finally {
    db.close();
    process.exit(0);
  }
});
