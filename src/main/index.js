import {
  app,
  shell,
  BrowserWindow,

  /* Notification, */
  Menu,
  dialog,
  protocol
} from 'electron';
import * as path from 'path';
import crypto from 'node:crypto';
import cron from 'node-cron';
import { logger } from './utility/logger.js';
import { fileURLToPath } from 'url';
import process from 'node:process';
import fs from 'node:fs';
import { pruneBackups } from './utility/utils.js';
import { paths } from './paths.js';
import { MpvService } from './mpvService.js';
import { mpvExecutable, mpvRuntimeStatus } from './mpvRuntime.js';
import {
  createOrUpdateChildWindow,
  sendToChild,
  getWindowNames,
  getWindow,
  broadcastThemePreferences
} from './windowManager.js';
import { normalizeMainTheme, normalizeEditorTheme } from '../shared/themePreferences.js';
import mime from 'mime-types';
import { getTrackCover } from './trackCover.js';
import { albumCoverChoices, selectAlbumCover, pickAlbumCover } from './albumCoverSelection.js';
import createUpdateTagsWorker from './updateTagsWorker?nodeWorker';
import { pendingTagSaveSummary } from './tagSaveJournal.js';
import { createTagSaveQueue } from './tagSaveDelivery.js';
import createUpdateFilesWorker from './updateFilesWorker?nodeWorker';
import createUpdateFoldersWorker from './updateFoldersWorker?nodeWorker';
import createUpdateCoversWorker from './updateCoversWorker?nodeWorker';
import createUpdateMetadataWorker from './updateMetadataWorker?nodeWorker';
import createLoadPlaylistWorker from './loadPlaylistWorker?nodeWorker';
import createUpdateTagFramesWorker from './updateTagFramesWorker?nodeWorker';
import createRescanTrackErrorWorker from './rescanTrackErrorWorker?nodeWorker';
import { getDB, backupDirectory, dbPath } from './connection';
import { initializeCatalog, repairCatalog } from './catalogStartup.js';
import { createStartupWindow } from './startupWindow.js';
import { availableMusicTracks, createMusicAvailabilityCheck } from './musicAvailability.js';
import { createWindowPresentation } from './windowPresentation.js';
import {
  guardedIpc,
  registerWindowAccess,
  rendererEntryUrl,
  configureIpcCatalog,
  grantArtworkAccess
} from './ipcAccess.js';
import { childDefinitions } from './childWindowDefinitions.js';
import { runUpdateWorker } from './updateWorkerDelivery.js';
import { createScanCoordinator } from './scanCoordinator.js';
import { createScanSchedule } from './scanSchedule.js';
import { createCoverDownloads } from './coverDownloads.js';
import { downloadCoverFile } from './coverDownloader.js';
/* import { simulateCorruption } from './simulateDbCorruption.js'; */
import { restoreLatestBackup } from './restoreBackup.js';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import searchCover from './folderImageCheck.js';

import { getPreferencesSync, getPreferences, savePreferences } from './preferences.js';
import {
  allTracksByScroll,
  allTracksBySearchTerm,
  allAlbumsByScroll,
  allAlbumsBySearchTerm,
  allCoversByScroll,
  allMissingCoversByScroll,
  filesByAlbum,
  likeTrack,
  isLiked,
  getAllPkeys,
  getAllTracks,
  getRoots,
  updateRoots
} from './sql.js';

import {
  totalTracks,
  topHundredArtists,
  genresWithCount,
  allTracksByArtist,
  allTracksByGenres,
  distinctDirectories,
  allTracksByRoot,
  albumsByTopFolder
} from './stats';

configureIpcCatalog(getDB);
const mpvPath = mpvExecutable({ development: is.dev, resources: process.resourcesPath });
const mpvService = new MpvService({ executable: mpvPath });
mpvService.on('state', (snapshot) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('mpv-state', snapshot);
});
let closingMpv = false;
app.on('before-quit', (event) => {
  if (closingMpv) return;
  closingMpv = true;
  scanSchedule.close();
  event.preventDefault();
  void mpvService.close().finally(() => app.quit());
});
function mpvCatalogTracks(ids) {
  const statement = getDB().prepare(
    'SELECT track_id, audiotrack FROM "audio-tracks" WHERE track_id = ?'
  );
  return ids.map((id) => {
    const track = statement.get(id);
    if (!track) throw new Error('An mpv queue entry is no longer in the music catalog.');
    return track;
  });
}
guardedIpc.handle('mpv-status', () => mpvRuntimeStatus(mpvPath));
guardedIpc.handle('mpv-load', (_event, config) =>
  mpvService.load(config, mpvCatalogTracks(config.ids))
);
guardedIpc.handle('mpv-control', (_event, command) =>
  mpvService.control(command.sessionId, command.operation, command.value)
);
guardedIpc.handle('mpv-update-queue', (_event, config) =>
  mpvService.updateQueue(config.sessionId, mpvCatalogTracks(config.ids))
);
guardedIpc.handle('mpv-stop', (_event, sessionId) => mpvService.stop(sessionId));
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'streaming',
    privileges: {
      stream: true,
      standard: true,
      bypassCSP: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  },
  {
    scheme: 'cover',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  }
]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.disableHardwareAcceleration();

function ensurePreferencesFile() {
  const src = path.join(process.resourcesPath, 'preferences.json'); // inside resources/
  const dest = paths.preferences; // userData/preferences.json

  try {
    // only copy if missing in userData
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!fs.existsSync(dest) && fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log('✅ Copied default preferences to userData folder.');
    }
  } catch (err) {
    console.error('❌ Failed to copy default preferences:', err);
  }
}

const mode = import.meta.env.MODE;

const logDir =
  mode === 'production'
    ? path.join(app.getPath('userData'), 'logs')
    : path.join(app.getPath('documents'), 'Music-Molecule', 'logs');

/* console.log('log Directory: ', logDir);

function testWrite() {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, 'test-write.log');
    const timestamp = new Date().toISOString();

    const line = `${timestamp} | 'test-the-write'\n`;
    fs.appendFileSync(logFile, line);
    console.log('test line written: ', line);
  } catch (err) {
    console.error('Failed to write bad-frame log: ', err);
  }
}

testWrite(); */

const playlistsFolder = paths.playlists;
if (!fs.existsSync(playlistsFolder)) {
  fs.mkdirSync(playlistsFolder, { recursive: true });
}
/* RANDOM ARRAY FOR TRACKS SHUFFLE */
let shuffled = new Array();

process.on('unhandledRejection', (err) => {
  console.error('Unhandled promise rejection:', err);
  logger.error('Unhandled promise rejection', { message: err.message, stack: err.stack });
  if (shouldRestartOnError(err)) {
    console.log('Critical error encountered, restarting app...');
    app.relaunch();
    app.exit(0);
  }
});

function shouldRestartOnError(err) {
  // Define conditions for restarting, e.g., critical errors only
  const criticalErrors = ['CriticalDatabaseFailure', 'FatalWorkerError'];
  return criticalErrors.includes(err.name);
}

// eslint-disable-next-line unused-imports/no-unused-vars, no-unused-vars
const task = (label) => {
  console.log(`Task ran for ${label} at ${new Date().toLocaleString()}`);
};

async function backupDatabase() {
  try {
    const db = getDB();
    fs.mkdirSync(backupDirectory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDirectory, `backup-${stamp}.db`);
    await db.backup(backupPath);
    await pruneBackups(backupDirectory, 3);
    console.log('Backup complete:', backupPath);
  } catch (error) {
    console.error('Backup failed:', error);
  }
}

export let theme;
export let mainTheme;
export let editorTheme;
/* export let mainTheme; */

const getTheme = () => {
  console.log('getTheme');
  const preferences = getPreferencesSync();
  theme = preferences?.theme || 'light';
  mainTheme = normalizeMainTheme(preferences?.mainTheme);
  editorTheme = normalizeEditorTheme(preferences?.editorTheme);
  global.currentTheme = mainTheme;
};

const scanSchedule = createScanSchedule({
  cron,
  run: () => Promise.all([updateFolders(), updateFiles()]),
  onError: (error) => console.error('Scheduled catalog update failed:', error)
});

const getCurrentSchedule = async () => {
  // Read the persisted snapshot without an async read racing a later schedule save.
  return scanSchedule.replace(getPreferencesSync().schedule ?? {});
};

/* async function backfillTags() {
  try {
    // eslint-disable-next-line no-unused-vars, unused-imports/no-unused-vars
    const workerPath = process.resourcesPath;
    const worker = await createBackfillWorker({ workerData: { batchSize: 20000 } });
    worker
      .on('message', (m) => {
        console.log('backfill Message:', m);
        if (m?.done) worker.terminate();
      })
      .on('error', (err) => console.error('backfill Worker error:', err))
      .on('exit', (code) => {
        if (code !== 0) console.error(`Worker stopped with exit code ${code}`);
      });
    worker.postMessage({ type: 'start' });
  } catch (error) {
    console.error('Worker encountered an error:', error);

    console.log('Handling subsequent code after worker error.');
  }
} */
/* backfillTags(); */

async function changeSemicolonDelimeter() {
  console.log('changeSemiColon');
  try {
    const workerPath = process.resourcesPath;
    const worker = await createUpdateTagFramesWorker({ workerData: { batchSize: 2000 } });
    worker
      .on('message', (msg) => {
        if (msg.progress) {
          console.log('message progress');
        }
        if (msg.type === 'completed') {
          return console.log('Worker finished', msg.stats);
        }
        /* if (m?.done) worker.terminate(); */
      })
      .on('error', (err) => console.error('update tag frames error:', err))
      .on('exit', (code) => {
        if (code !== 0) console.error(`Update Tag Frames Worker stopped with exit code ${code}`);
      })
      .postMessage({ cmd: 'start' });
  } catch (error) {
    console.error('Update Tag Frames Worker encountered an error:', error);

    console.log('Handling subsequent code after worker error.');
  }
}
/* setTimeout(() => changeSemicolonDelimeter(), 3000); */

const coordinateScan = createScanCoordinator({
  onChange: (kind) => {
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send('catalog-changed', kind);
  }
});

function runCatalogScan(kind, target) {
  return coordinateScan({
    kind,
    createWorker: kind === 'files' ? createUpdateFilesWorker : createUpdateFoldersWorker,
    workerData: dbPath,
    target,
    formatResult: kind === 'files' ? getObjectWithLengths : (result) => result
  });
}

async function updateFolders() {
  try {
    console.log('Scheduled folder update:', await runCatalogScan('folders'));
  } catch (error) {
    console.error('Scheduled folder update failed:', error);
  }
}

async function updateFiles() {
  try {
    console.log('Scheduled file update:', getObjectWithLengths(await runCatalogScan('files')));
  } catch (error) {
    console.error('Scheduled file update failed:', error);
  }
}

const capitalizeDriveLetter = (str) => {
  return `${str.charAt(0).toUpperCase()}:${str.slice(1)}`;
};

export let mainWindow;
const windowPresentation = createWindowPresentation(() => mainWindow);
let recWindow;
let startupWindow;

function showWhenReady(window) {
  window.once('ready-to-show', () => {
    window.show();
    if (startupWindow && !startupWindow.isDestroyed()) startupWindow.destroy();
    startupWindow = null;
    if (window === mainWindow && recWindow && !recWindow.isDestroyed()) recWindow.close();
  });
}

export function createRecoveryWindow() {
  recWindow = new BrowserWindow({
    frame: true,
    show: false,
    resizable: false,
    width: 520,
    height: 360,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      additionalArguments: [`--mainTheme=${mainTheme}`, '--window-role=recovery'],
      sandbox: true,
      webSecurity: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  registerWindowAccess(recWindow, 'recovery', rendererEntryUrl('index'));
  showWhenReady(recWindow);

  // Load the same app URL — StartupGuard handles rendering the right UI
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    recWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/index.html`);
  } else {
    recWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return recWindow;
}

guardedIpc.on('window-action', (event, action) => {
  console.log('window action: ', action);
  switch (action) {
    case 'close':
      mainWindow.close();
      break;
    case 'minimize':
      mainWindow.minimize();
      break;
    case 'maximize':
      if (!mainWindow.isMaximizable()) break;
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.setMaximumSize(4000, 4000);
        mainWindow.maximize();
      }
      break;
    default:
      console.warn('Unknown window action:', action);
  }
});

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    frame: false,
    useContentSize: true,
    transparent: true,
    alwaysOnTop: false,
    show: false,
    ...(process.platform === 'linux' ? { icon: path.join(__dirname, '../../build/icon.png') } : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      additionalArguments: [`--mainTheme=${mainTheme}`, '--window-role=main'],
      sandbox: true,
      webSecurity: true,
      contextIsolation: true,
      nodeIntegration: false
      /* additionalArguments: [`--mainTheme=${mainTheme}`] */
      /* nodeIntegration: true */
    }
  });

  registerWindowAccess(mainWindow, 'main', rendererEntryUrl('index'));
  showWhenReady(mainWindow);
  // The independent editor and cover-search windows belong to this app session.
  mainWindow.webContents.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => {
    if (mainFrame && !inPlace) void mpvService.stop(mpvService.session?.sessionId);
  });
  mainWindow.webContents.on('render-process-gone', () => {
    void mpvService.stop(mpvService.session?.sessionId);
  });
  mainWindow.once('closed', () => app.quit());

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/index.html`);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
  return mainWindow;
}

/* function launchDevTools() {
  try {
    const bin = process.platform === 'win32' ? 'react-devtools.cmd' : 'react-devtools';

    const binPath = path.join(app.getAppPath(), 'node_modules', '.bin', bin);
    console.log('binPath: ', binPath);
    const bat = spawn(binPath, { shell: true });
    bat.unref(); // don't tie Electron lifecycle to DevTools
  } catch (e) {
    console.error('devtools error: ', e.message);
  }
} */

/* launchDevTools(); */

let databaseStatus = { ok: false, error: 'The music catalog is starting.' };
let repairResult;
let restoreResult;
let normalAppStarted = false;

function startNormalApp() {
  if (normalAppStarted) return;
  createWindow();
  normalAppStarted = true;
  void backupDatabase();
  getCurrentSchedule().catch((error) => console.error('Unable to load update schedule:', error));
}

app
  .whenReady()
  .then(async () => {
    startupWindow = await createStartupWindow();
    console.log('is music-molecule handled?', await protocol.isProtocolHandled('streaming'));
    console.log('is app handled?', await protocol.isProtocolHandled('cover'));

    protocol.registerStreamProtocol('streaming', async (request, cb) => {
      try {
        // A fresh request token makes retries re-read the source instead of a cached failure.
        const uri = decodeURIComponent(request.url.split('?')[0]);
        const filePath = uri.replace('streaming://', '');
        const path = capitalizeDriveLetter(filePath);

        if (!fs.existsSync(path)) {
          console.error('File not found:', path);
          return cb({
            statusCode: 404,
            headers: { 'Content-Type': 'text/plain' },
            data: 'File not found'
          });
        }

        const fileSize = fs.statSync(path).size;
        const range = request.headers.Range;

        if (range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

          if (start >= fileSize || end >= fileSize) {
            console.error('Invalid range request:', range);
            return cb({
              statusCode: 416,
              headers: { 'Content-Range': `bytes */${fileSize}`, 'Content-Type': 'text/plain' },
              data: 'Requested range not satisfiable'
            });
          }

          const chunksize = end - start + 1;

          const headers = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Access-Control-Allow-Origin': '*',
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunksize),
            'Content-Type': 'audio/mpeg'
          };

          cb({
            statusCode: 206,
            headers,
            data: fs.createReadStream(path, { start, end }).on('error', (err) => {
              console.error('Stream error:', err);
              cb({
                statusCode: 200,
                headers: { 'Content-Type': 'text/plain', 'X-Stream-Error': 'true' },
                data: 'Stream failed due to an error.'
              });
            })
          });
        } else {
          console.log('No range header provided');
          cb({
            statusCode: 200,
            headers: {
              'Content-Length': String(fileSize),
              'Content-Type': 'audio/mpeg',
              'Access-Control-Allow-Origin': '*'
            },
            data: fs.createReadStream(path).on('error', (err) => {
              console.error('Stream error:', err);
              cb({
                statusCode: 500,
                headers: { 'Content-Type': 'text/plain', 'X-Stream-Error': 'true' },
                data: 'Stream failed due to an error.'
              });
            })
          });
        }
      } catch (err) {
        console.error('Error processing streaming request:', err);
        cb({
          statusCode: 500,
          headers: { 'Content-Type': 'text/plain', 'X-Stream-Error': 'true' },
          data: 'Internal Server Error'
        });
      }
    });

    protocol.handle('cover', async (request) => {
      try {
        let url = decodeURIComponent(request.url.substring(8));
        // Handle Windows drive-letter paths explicitly
        if (/^[a-zA-Z]:/.test(url)) {
          // Already an absolute path, no further changes needed
        } else if (/^[a-zA-Z]\//.test(url)) {
          // Convert "I/music/..." to "I:/music/..."
          url = `${url[0]}:/${url.slice(2)}`;
        } else {
          throw new Error('Invalid or relative path received');
        }
        const filePath = path.normalize(url);

        await fs.promises.access(filePath);

        // Determine the MIME type based on the file extension
        const mimeType = mime.lookup(filePath) || 'application/octet-stream';

        // Read the file content
        const fileContent = await fs.promises.readFile(filePath);

        // Return the file content as a response with the appropriate MIME type
        return new Response(fileContent, { headers: { 'Content-Type': mimeType } });
      } catch (err) {
        console.error('Error accessing file:', err.message);
        throw new Error('FILE_NOT_FOUND');
      }
    });

    ensurePreferencesFile();
    getTheme();
    electronApp.setAppUserModelId('com.electron.app');
    app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window));

    databaseStatus = initializeCatalog();
    if (databaseStatus.ok) startNormalApp();
    else createRecoveryWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length) return;
      if (databaseStatus.ok) createWindow();
      else createRecoveryWindow();
    });
  })
  .catch((error) => {
    if (startupWindow && !startupWindow.isDestroyed()) startupWindow.destroy();
    if (error.name === 'StartupCancelled') {
      app.quit();
      return;
    }
    console.error('Application startup failed:', error);
    dialog.showErrorBox('Music Molecule could not start', error.message);
    app.quit();
  });

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

guardedIpc.handle('artwork-view', (event, enabled) => {
  if (event.sender !== mainWindow?.webContents) return false;
  return windowPresentation.setArtwork(enabled === true);
});

function completeRecovery(event) {
  if (normalAppStarted || event.sender !== recWindow?.webContents) return;
  databaseStatus = initializeCatalog();
  if (databaseStatus.ok) startNormalApp();
  else event.sender.send('recovery-error', databaseStatus.error);
}

guardedIpc.on('recovery-complete', completeRecovery);
guardedIpc.on('app-restart', completeRecovery);

guardedIpc.handle('db-check', () => databaseStatus);

guardedIpc.handle('db-repair', (event) => {
  if (event.sender !== recWindow?.webContents) {
    return { fixed: false, error: 'Database repair is available from the recovery window.' };
  }
  repairResult ??= Promise.resolve().then(() => {
    const result = repairCatalog();
    databaseStatus = { ok: result.fixed, error: result.error };
    return result;
  });
  return repairResult;
});

guardedIpc.handle('db-restore', (event) => {
  if (event.sender !== recWindow?.webContents) {
    return { restored: false, error: 'Database restore is available from the recovery window.' };
  }
  if (!restoreResult) {
    restoreResult = restoreLatestBackup().finally(() => {
      restoreResult = null;
    });
  }
  return restoreResult;
});

guardedIpc.handle('get-roots', async () => {
  const rootFolders = await getRoots();
  return rootFolders;
});

guardedIpc.handle('update-roots', async (event, roots) => {
  try {
    const update = await updateRoots(roots);
    return update;
  } catch (error) {
    console.error(error.message);
  }
});

guardedIpc.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'multiSelections']
  });
  return result.filePaths; // array of absolute folder paths
});

guardedIpc.handle('get-folder-path', (event, folderName) => {
  /*  console.log('folderName: ', folderName); */
  return path.resolve(folderName);
});

/* guardedIpc.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0]; 
  } else {
    return null; 
  }
}); */

guardedIpc.handle('update-folders', () => {
  void runCatalogScan('folders', mainWindow?.webContents).catch((error) =>
    console.error('Folder update failed:', error)
  );
});

function getObjectWithLengths(obj) {
  return {
    new: Array.isArray(obj.new) ? obj.new.length : 0,
    deleted: Array.isArray(obj.deleted) ? obj.deleted.length : 0,
    nochange: obj.nochange,
    skippedRoots: obj.skippedRoots
  };
}

guardedIpc.handle('update-files', () => {
  void runCatalogScan('files', mainWindow?.webContents).catch((error) =>
    console.error('File update failed:', error)
  );
});

guardedIpc.handle('update-meta', () => {
  runUpdateWorker(
    createUpdateMetadataWorker,
    dbPath,
    mainWindow?.webContents,
    'metadata',
    'meta-error'
  );
});

guardedIpc.handle('update-covers', () => {
  runUpdateWorker(
    createUpdateCoversWorker,
    dbPath,
    mainWindow?.webContents,
    'covers',
    'covers-error'
  );
});

guardedIpc.handle('get-tracks', async (event, ...args) => {
  if (args[1] === '') {
    const alltracks = await allTracksByScroll(args[0], args[2]);
    return alltracks;
  } else if (args[1]) {
    const alltracks = await allTracksBySearchTerm(args[0], args[1], args[2]);
    return alltracks;
  }
});

guardedIpc.handle('get-albums', async (event, ...args) => {
  if (args[1] === '') {
    const allAlbums = await allAlbumsByScroll(args[0], args[2]);
    return allAlbums;
  } else {
    const allAlbums = await allAlbumsBySearchTerm(args[0], args[1], args[2]);
    return allAlbums;
  }
});

/* guardedIpc.handle('get-album', async (_, args) => {
  const album = getAlbum(args);
  return album;
});
 */
guardedIpc.handle('get-album-tracks', async (event, args) => {
  //console.log('get-album-tracks');
  const allAlbumTracks = await filesByAlbum(args);
  //console.log('album-tracks: ', allAlbumTracks);
  return allAlbumTracks;
});

guardedIpc.handle('check-track-availability', async (_event, file) => {
  return createMusicAvailabilityCheck()(file);
});

guardedIpc.handle('prepare-music-tracks', async (_event, request) => {
  const tracks = request.album !== undefined ? filesByAlbum(request.album) : request.tracks;
  const result = await availableMusicTracks(tracks);
  return request.inspect ? { ...result, catalogTracks: tracks } : result;
});

const getRoot = (currentDir) => {
  /* console.log(currentDir); */
  const root = getRoots();
  const allPaths = [];
  const paths = path.normalize(currentDir).split(path.sep);
  const pathsStr = paths.join('/');
  const rootFiltered = root.filter((r) => pathsStr.startsWith(r)).join('');
  //console.log(pathsStr === currentDir);
  const sliced = pathsStr.replace(`${rootFiltered}/`, '');
  const split = sliced.split('/');
  const splitLength = split.length;
  if (splitLength > 1) {
    allPaths.push(`${rootFiltered}/${split[0]}`);
    for (let i = splitLength - 1; i > 0; i--) {
      let tmp = `${rootFiltered}/${split[0]}/${split[i]}`;
      if (tmp !== currentDir) {
        allPaths.push(tmp);
      }
    }
  }
  return allPaths;
};

guardedIpc.handle('get-cover', (_event, track) => getTrackCover(track, { getRoot, searchCover }));

guardedIpc.on('screen-mode', (event, ...args) => {
  if (event.sender === mainWindow?.webContents) windowPresentation.setMode(args[0]);
});

guardedIpc.handle('update-like', async (event, ...args) => {
  try {
    const likeBtn = await likeTrack(args[0]);
    if (likeBtn[1] === 0) {
      return event.sender.send('track-liked', `${args[0]}`);
    } else if (likeBtn[1] === 1) {
      return event.sender.send('track-like-removed', `${args[0]}`);
    }
  } catch (error) {
    console.error('Error updating like:', error);
  }
});

guardedIpc.handle('is-liked', async (event, arg) => {
  const checkIsLiked = await isLiked(arg);
  return checkIsLiked;
});

guardedIpc.handle('total-tracks-stat', async () => {
  const totals = await totalTracks();
  const totalCounts = {
    albums: totals.albumsInfo['COUNT(*)'],
    tracks: totals.tracksInfo['COUNT(*)']
  };
  return totalCounts;
});

guardedIpc.handle('artists-by-num-tracks', async () => {
  const artistList = await topHundredArtists();
  return artistList; /* .slice(1); */
});

function openWindowAndSendData(queryResults, listType) {
  if (!sendToChild('table-data', { listType, results: queryResults })) {
    console.error('The metadata editor window is not open.');
  }
}

guardedIpc.handle('get-tracks-by-category', async (event, obj) => {
  const { listType, value } = obj;
  /*  console.log('-----> ', listType, value); */
  try {
    let tracks;
    switch (listType) {
      case 'artist-tracks': {
        tracks = await allTracksByArtist(value);
        break;
      }
      case 'genre-tracks': {
        tracks = await allTracksByGenres(value);
        break;
      }
      case 'album-tracks': {
        tracks = await filesByAlbum(value);
        break;
      }
      case 'root-tracks': {
        tracks = await allTracksByRoot(value);
        break;
      }
      default:
        return;
    }
    if (tracks && tracks.length > 0) {
      /* console.log('tracks: ', tracks); */
      await openWindowAndSendData(tracks, listType);
      return event.sender.send('tracks-loaded', `${listType}-loaded`);
    } else {
      await openWindowAndSendData([], listType);
      return event.sender.send('tracks-loaded', `${listType}-loaded`);
    }
  } catch (err) {
    console.error(err.message);
  }
});

guardedIpc.handle('distinct-directories', async () => {
  try {
    const dirs = await distinctDirectories();
    return dirs;
  } catch (e) {
    console.log(e.message);
  }
});

/* guardedIpc.handle('get-tracks-by-root', async (event, root, listType) => {
  try {
    const rootTracks = await allTracksByRoot(root);
    await openWindowAndSendData(rootTracks, listType);
  } catch (e) {
    console.error(e.message);
  }
}); */

guardedIpc.handle('check-for-open-table', async (event, name) => {
  const names = await getWindowNames();
  if (names.includes(name)) {
    return true;
  }
  return false;
});

guardedIpc.on('clear-table', () => {
  const targetWindow = getWindow('table-data');
  /* targetWindow.webContents.send('clear-table', 'clear'); */
  targetWindow?.webContents.send('reset-table');
});

guardedIpc.handle('get-albums-by-root', async (event, dirs) => {
  const results = await albumsByTopFolder(dirs);
  return results;
});

guardedIpc.handle('genres-stat', async () => {
  const genres = await genresWithCount();
  return genres;
});

/* guardedIpc.handle('folders-stat', async (event, dirs) => {
  const folders = await foldersWithCount(dirs);
  return folders;
}); */

guardedIpc.handle('open-playlist', async () => {
  const open = await dialog.showOpenDialog(mainWindow, {
    defaultPath: playlistsFolder,
    properties: ['openFile'],
    filters: [{ name: 'Playlist', extensions: ['m3u'] }]
  });
  if (open.canceled) return 'action cancelled';

  const result = await new Promise((resolve, reject) => {
    const worker = createLoadPlaylistWorker({
      workerData: { dbPath, data: open.filePaths }
    });

    let replied = false;
    worker.on('message', (msg) => {
      replied = true;
      if (msg.error) reject(new Error(msg.error));
      else resolve(msg.data);
    });
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0 || !replied)
        reject(new Error(`Playlist worker stopped without a result (exit ${code}).`));
    });

    worker.postMessage(''); // optional trigger
  });
  return result;
});

guardedIpc.handle('save-playlist', async (_, args) => {
  try {
    const save = await dialog.showSaveDialog(mainWindow, {
      defaultPath: playlistsFolder,
      filters: [{ name: 'Playlist', extensions: ['m3u'] }]
    });

    if (save.canceled) {
      return 'Action cancelled';
    }

    const playlistContent = args.map((a) => a.audiotrack.replaceAll('/', '\\')).join('\n');

    fs.writeFileSync(save.filePath, playlistContent, { flag: 'w' });

    await dialog.showMessageBox(mainWindow, {
      message: `Saved playlist: ${path.basename(save.filePath)}`,
      buttons: ['OK']
    });

    return 'Playlist saved successfully';
  } catch (error) {
    console.error('Error saving playlist:', error);
    return 'Failed to save playlist';
  }
});

/* guardedIpc.handle('get-playlists', async () => {
  const playlistsStats = [];
  const playlists = await fs.promises.readdir(playlistsFolder);
  for await (const pl of playlists) {
    let tmp = await fs.promises.stat(`${playlistsFolder}\\${pl}`);
    if (tmp) {
      playlistsStats.push({ name: pl, createdon: convertToUTC(tmp.birthtimeMs) });
    }
  }
  return playlists;
}); */

/* guardedIpc.handle('get-temp-path', async () => {
  return app.getPath('temp');
}); */

/* guardedIpc.handle('homepage-playlists', async (_m, ...args) => {
  const [type, value] = args;
  switch (type) {
    case 'edit':
      const editplfile = await fs.promises.readFile(`${playlistsFolder}\\${value}`, {
        encoding: 'utf8'
      });
      break;
    case 'delete':
      const delplfile = await fs.promises.unlink(`${playlistsFolder}\\${value}`);
      break;
    case 'play':
    default:
      return;
  }
}); */

guardedIpc.handle('get-covers', async (_, ...args) => {
  //console.log('get-covers: ', args);
  let albums;

  if (args[3] === 'missing-covers') {
    albums = await allMissingCoversByScroll(args[0], args[2]);
  } else {
    albums = await allCoversByScroll(args[0], args[2], args[1]);
  }
  return albums;
});

const shuffle = (array) => {
  const shuffledArray = [...array];
  for (let i = shuffledArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledArray[i], shuffledArray[j]] = [shuffledArray[j], shuffledArray[i]];
  }
  return shuffledArray;
};

guardedIpc.handle('set-shuffled-tracks-array', async () => {
  shuffled = [];
  const primaryKeysArray = getAllPkeys();
  shuffled = shuffle(primaryKeysArray);
});

guardedIpc.handle('get-shuffled-tracks', async (_, args) => {
  console.log('get shuffled tracks', args);
  const offset = args;
  const limit = 200;
  try {
    const start = offset * limit;
    const end = start + limit - 1;

    const fifty = shuffled.slice(start, end + 1);
    const tracks = getAllTracks(fifty);
    return tracks;
  } catch (err) {
    console.log(err.message);
  }
});

const tagSaveQueue = createTagSaveQueue({
  createWorker: createUpdateTagsWorker,
  onChange: () => {
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send('updated-tags', 'updated-tags');
  }
});
const queueTagSave = (event, data, mode = 'save') =>
  tagSaveQueue({
    workerPath: dbPath,
    data,
    mode,
    logDir,
    target: event.sender
  });

guardedIpc.handle('get-pending-tag-saves', () => pendingTagSaveSummary(getDB()));
guardedIpc.handle('update-tags', (event, data) => queueTagSave(event, data));
guardedIpc.handle('retry-tag-saves', (event) => queueTagSave(event, [], 'recover'));
guardedIpc.handle('forget-tag-save', (_event, record) =>
  tagSaveQueue({ workerPath: dbPath, data: [record], mode: 'forget', logDir, target: null })
);

guardedIpc.handle('rescan-track-error', (event, track, id) => {
  const sender = event.sender;
  const sendResult = (result) => {
    if (!sender.isDestroyed()) sender.send('rescanned-track', result);
  };

  sendResult({ status: 'starting', id });
  return new Promise((resolve) => {
    let completed = false;
    let workerResult;
    const finish = (result) => {
      if (completed) return;
      completed = true;
      sendResult(result);
      resolve(result);
    };
    const fail = (error) => finish({ id, processed: track, success: false, error });

    try {
      const worker = createRescanTrackErrorWorker({ workerData: { track, id, dbPath } });
      worker.on('message', (message) => {
        if (message.type === 'completed') workerResult = message.result;
        if (message.type === 'fatal') fail(message.error);
      });
      worker.once('error', (error) => fail(error.message));
      worker.once('exit', (code) => {
        if (code !== 0) fail(`Rescan worker stopped with exit code ${code}.`);
        else if (workerResult) finish(workerResult);
        else fail('Rescan worker exited without returning a result.');
      });
      worker.postMessage({ cmd: 'start' });
    } catch (error) {
      fail(error.message);
    }
  });
});

guardedIpc.on('show-context-menu', (event, id, type, path = undefined) => {
  const context = { id, type, path };
  const template = [];
  console.log('show-context-menu for cover: ', id, type);

  // Add items based on the 'type'
  if (type === 'files') {
    template.push(
      {
        label: 'Add Track to Playlist',
        click: () =>
          event.sender.send('context-menu-command', { command: 'add-track-to-playlist', context })
      },
      { type: 'separator' },
      {
        label: 'Edit Track Metadata',
        click: () =>
          event.sender.send('context-menu-command', { command: 'edit-track-metadata', context })
      }
    );
  }

  if (type === 'folder') {
    template.push(
      {
        label: 'Add Album to Playlist',
        click: () =>
          event.sender.send('context-menu-command', { command: 'add-album-to-playlist', context })
      },
      { type: 'separator' },
      {
        label: 'Open Album Folder',
        click: () =>
          event.sender.send('context-menu-command', { command: 'open-album-folder', context })
      }
    );
  }

  if (type === 'playlist') {
    template.push(
      {
        label: 'Remove from Playlist',
        click: () =>
          event.sender.send('context-menu-command', { command: 'remove-from-playlist', context })
      },
      { type: 'separator' },
      {
        label: 'Edit Track Metadata',
        click: () =>
          event.sender.send('context-menu-command', { command: 'edit-track-metadata', context })
      }
    );
  }

  if (type === 'cover') {
    console.log('cover called');
    const customLabel = id === 'cover-search-alt' ? 'Save Image' : 'Select Image';
    template.push({
      label: customLabel,
      click: () => event.sender.send('context-menu-command', 'save image')
    });
  }

  if (type === 'tag-context-menu') {
    template.push({ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectall' });
  }

  if (type === 'picture') {
    /*  const fileIndex = id.path.lastIndexOf('/');
    const strEnd = id.path.substring(0, fileIndex); */
    template.push(
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectall' },
      {
        label: `Get image for single track`,
        click: () => event.sender.send('context-menu-command', { type: 'single-track', params: id })
      },
      {
        label: 'Select image from folder for single track',
        click: () =>
          event.sender.send('context-menu-command', { type: 'search-folder-single', params: id })
      }
    );
  }

  if (type === 'form-picture') {
    template.push(
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectall' },
      {
        label: `Get image for selected tracks`,
        click: () =>
          event.sender.send('form-menu-command', {
            type: 'form-search-online',
            params: 'all-tracks'
          })
      },
      {
        label: 'Select image from folder for selected tracks',
        click: () =>
          event.sender.send('form-menu-command', {
            type: 'form-search-folder',
            params: 'search-folder-all-tracks'
          })
      }
    );
  }

  if (type === 'menu') {
    template.push(
      {
        label: 'Settings…',
        click: () => event.sender.send('hamburger-menu-command', 'settings')
      },
      {
        label: 'Update Files',
        click: () => event.sender.send('hamburger-menu-command', 'update-files')
      },
      {
        label: 'Update Folders',
        click: () => event.sender.send('hamburger-menu-command', 'update-folders')
      },
      {
        label: 'Update Covers',
        click: () => event.sender.send('hamburger-menu-command', 'update-covers')
      },
      {
        label: 'Catalog report',
        click: () => event.sender.send('hamburger-menu-command', 'update-meta')
      }
    );
  }

  // Create and show the context menu
  const menu = Menu.buildFromTemplate(template);
  menu.popup(BrowserWindow.fromWebContents(event.sender));
});

guardedIpc.handle('get-album-cover-choices', (_event, folder) =>
  albumCoverChoices(getDB(), folder)
);
guardedIpc.handle('select-album-cover', (_event, folder, image) =>
  selectAlbumCover(getDB(), folder, image)
);

guardedIpc.handle('pick-album-cover', (event, folder) =>
  pickAlbumCover(getDB(), folder, async () => {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: 'Choose local album cover',
      defaultPath: folder,
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }]
    });
    return result.canceled || event.sender.isDestroyed() ? null : result.filePaths[0];
  })
);

guardedIpc.handle('show-album-cover-menu', (event, path, folder) => {
  console.log('show-album-cover-menu');
  const template = [
    {
      label: 'add album to playlist',
      click: () => {
        return event.sender.send('album-menu', {
          menuoption: 'add album to playlist',
          path,
          folder
        });
      }
    },
    { type: 'separator' },
    {
      label: 'open album folder',
      click: () => {
        return event.sender.send('album-menu', { menuoption: 'open album folder', path, folder });
      }
    },
    { type: 'separator' },
    {
      label: 'Choose album cover…',
      click: () =>
        event.sender.send('album-menu', { menuoption: 'choose album cover', path, folder })
    },
    {
      label: 'cover search',
      click: () => {
        return event.sender.send('album-menu', { menuoption: 'cover search', path, folder });
      }
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  menu.popup(BrowserWindow.fromWebContents(event.sender));
});

guardedIpc.handle('show-text-input-menu', (event) => {
  try {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);

    if (!targetWindow) {
      throw new Error('Target window not found');
    }

    const inputMenu = Menu.buildFromTemplate([
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { type: 'separator' },
      { role: 'selectall' }
    ]);

    inputMenu.popup(targetWindow);
  } catch (error) {
    console.error('Error showing input menu:', error);
  }
});

guardedIpc.handle('show-child', async (event, args) => {
  console.log('show-child: ', 'hit');
  const { name, data } = args;
  const winConfig = { ...childDefinitions[name], show: false, resizable: true };
  const opener = BrowserWindow.fromWebContents(event.sender);
  await createOrUpdateChildWindow(name, data.listType, winConfig, data, opener);
});

const coverDownloads = createCoverDownloads({
  dialog,
  downloadFile: downloadCoverFile,
  getEditor: () => getWindow('table-data'),
  temporaryDirectory: () => app.getPath('temp'),
  onStaged: grantArtworkAccess
});

function coverRequestAllowed(event, name) {
  const window = getWindow(name);
  return window?.webContents === event.sender && event.senderFrame === event.sender.mainFrame;
}

guardedIpc.handle('download-file', (event, fileUrl, folder) =>
  coverRequestAllowed(event, 'cover-search-alt')
    ? coverDownloads.save(event.sender, fileUrl, folder)
    : { status: 'error', message: 'This window cannot request a cover download.' }
);

guardedIpc.handle('download-tag-image', (event, fileUrl, filePath, delayDownload = true) =>
  coverRequestAllowed(event, 'cover-search-alt-tags')
    ? coverDownloads.stage(event.sender, fileUrl, filePath, delayDownload)
    : { status: 'error', message: 'This window cannot request tag artwork.' }
);

guardedIpc.handle('select-image-from-folder', async (event, arr, delayDownload = false) => {
  let tempFile;
  /* const filePath = arr; */
  const startFolder = Array.isArray(arr) ? path.dirname(arr[0]) : path.dirname(arr);
  const targetWindow = getWindow('table-data');

  try {
    const result = await dialog.showOpenDialog(targetWindow, {
      defaultPath: path.normalize(startFolder),
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }]
    });

    if (result.canceled || result.filePaths.length === 0) {
      targetWindow.webContents.send('updated-tags', 'update-cancelled');
      return;
    }

    tempFile = result.filePaths[0].replace(/\\/g, '/');
    grantArtworkAccess(event.sender, tempFile);

    if (delayDownload) {
      console.log('delayDownload------> :', delayDownload);
      return targetWindow.webContents.send('save-image-folder', tempFile);
    }
    /* 
    const workerPath = process.resourcesPath;
    let remove = false;
    targetWindow.webContents.send('update-tags', 'starting');
    await createUpdateTagImageWorker({
      workerData: { workerPath: workerPath, data: { tempFile, filePath, remove } }
    })
      .on('message', () => {
        targetWindow.webContents.send('update-tags', 'image(s) updated');
      })
      .on('error', (err) => {
        console.error('Worker error:', err);
        targetWindow.webContents.send('update-tags', 'error processing');
      })
      .on('exit', (code) => {
        if (code !== 0) {
          console.error(`Worker stopped with exit code ${code}`);
        }
      })
      .postMessage(''); */
  } catch (error) {
    console.error(error.message);
  }
});

/* guardedIpc.handle('refresh-cover', async (event, ...args) => {
  const [file, filepath] = args;
  const imgurl = url.pathToFileURL(file).href;
   const imageobj = { img: imgurl.href }; 

  BrowserWindow.fromId(mainWindow.id).webContents.send('refresh-home-cover', filepath, imgurl);
}); */

guardedIpc.on('open-album-folder', async (_, path) => {
  console.log('path: ', path);
  /* console.log('open-album-folder'); */
  try {
    if (!(await fs.promises.stat(path)).isDirectory())
      throw new Error('The selected location is not a folder.');
    return shell.openPath(path);
  } catch (error) {
    console.error(error.message);
  }
});

guardedIpc.handle('get-preferences-sync', () => {
  /* console.log('sync-called'); */
  const prefs = getPreferencesSync();
  return prefs;
});

guardedIpc.handle('get-preferences', async () => {
  try {
    const prefs = await getPreferences();
    return prefs;
  } catch (e) {
    console.log('get preferences error: ', e);
  }
});

guardedIpc.handle('save-preferences', async (event, preferences) => {
  console.log('---------> save-preferences', preferences);
  try {
    const saveResults = await savePreferences(preferences);
    if (!saveResults) throw new Error('Preferences could not be saved.');
    if (Object.hasOwn(preferences, 'schedule')) {
      await getCurrentSchedule();
    }
    if (preferences.theme || preferences.mainTheme || preferences.editorTheme) {
      getTheme();
      if (preferences.mainTheme && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('main-theme-updated');
      }
      broadcastThemePreferences({ mainTheme, editorTheme });
    }

    return saveResults;
  } catch (error) {
    console.error(error);
    return false;
  }
});

/* guardedIpc.handle('send-track-notification', async (event, track) => {
  console.log('track-----> : ', track);
  new Notification({ title: track.title || 'Now Playing', body: `Artist: ${track.artist}` }); 
  new Notification({ title: track.title, body: track.body, icon: track.icon }).show();
});
 */
