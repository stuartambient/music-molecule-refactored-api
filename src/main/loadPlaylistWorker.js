import { parentPort, workerData } from 'node:worker_threads';
import Database from 'better-sqlite3';
import { loadCatalogPlaylist } from './playlistCatalog.js';

if (!parentPort) throw Error('IllegalState');
parentPort.once('message', async () => {
  let db;
  try {
    db = new Database(workerData.dbPath, { readonly: true, fileMustExist: true });
    const result = await loadCatalogPlaylist(db, workerData.data[0]);
    parentPort.postMessage({ data: result });
  } catch (error) {
    parentPort.postMessage({ error: error.message });
  } finally {
    db?.close();
    parentPort.close();
  }
});
