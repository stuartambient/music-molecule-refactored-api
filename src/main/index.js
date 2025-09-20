import {
  app,
  shell,
  session,
  BrowserWindow,
  ipcMain,
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
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createOrUpdateChildWindow, getWindowNames, getWindow } from './windowManager.js';
import mime from 'mime-types';
import url from 'url';
import { File } from 'node-taglib-sharp';
import createUpdateTagsWorker from './updateTagsWorker?nodeWorker';
import createUpdateFilesWorker from './updateFilesWorker?nodeWorker';
import createUpdateFoldersWorker from './updateFoldersWorker?nodeWorker';
import createUpdateCoversWorker from './updateCoversWorker?nodeWorker';
import createUpdateMetadataWorker from './updateMetadataWorker?nodeWorker';
import createBackfillWorker from './backfillWorker?nodeWorker';
import axios from 'axios';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import searchCover from './folderImageCheck.js';
import db from './connection.js';

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
  /*   getAlbum, */
  getPlaylist,
  getAllPkeys,
  getAllTracks,
  getRoots,
  updateRoots,
  initializeDatabase
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.disableHardwareAcceleration();

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'streaming',
    privileges: { stream: true, standard: true, bypassCSP: true, supportFetchAPI: true }
  }
]);

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'cover',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  }
]);

/* IN DOCUMENTS/ELECTRONMUSICPLAYER */
/* console.log('home: ', app.getPath('home'));
console.log('appData: ', app.getPath('appData'));
console.log('temp: ', app.getPath('temp'));
console.log('userData: ', app.getPath('userData')); */

const playlistsFolder = `${app.getPath('documents')}\\Music-Molecule\\playlists`;
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

export let theme;
export let mainTheme;
/* export let mainTheme; */

const getTheme = () => {
  console.log('getTheme');
  const preferences = getPreferencesSync();
  theme = preferences?.theme || 'light';
  mainTheme = preferences?.mainTheme;
  global.currentTheme = mainTheme;

  /*  mainTheme = preferences?.mainTheme || 'basic';
  console.log('mainTheme: ', mainTheme); */
};

/* getTheme(); */

let currentSchedule;
let cronSchedule = [];

/* console.log('cronSchedule: ', cronSchedule); */

const getCurrentSchedule = async () => {
  console.log('get-current-schedule');
  const sched = await getPreferences();
  currentSchedule = sched.schedule;
  cronSchedule = [];
  //console.log('current Schedule: ', currentSchedule);
  if (typeof currentSchedule === 'string' && currentSchedule.startsWith('everyday')) {
    const timeOfDay = currentSchedule.split('@')[1];
    const [hourStr, minuteStr] = timeOfDay.split(':');
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);
    const cronExp = `${minute} ${hour} * * *`;
    /* return  */ cronSchedule.push(cronExp);
  } else {
    for (const [key, value] of Object.entries(currentSchedule)) {
      if (value) {
        //console.log(key, '..', value);
        const [hourStr, minuteStr] = value.split(':');
        const hour = parseInt(hourStr, 10);
        const minute = parseInt(minuteStr, 10);

        const cronExpr = `${minute} ${hour} * * ${key}`;
        cronSchedule.push(cronExpr);
      }
    }
    cronSchedule.forEach((expr) => {
      cron.schedule(
        expr,
        () => {
          updateFolders();
          updateFiles();
          console.log(`Running job schedule: ${expr}`);
        },
        { maxExecutions: 1 }
      );
    });
    return cronSchedule;
  }
};

// eslint-disable-next-line no-unused-vars, unused-imports/no-unused-vars
async function backfillTags() {
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
}
/* backfillTags(); */

async function updateFolders() {
  try {
    const workerPath = process.resourcesPath;
    await createUpdateFoldersWorker({ workerData: workerPath })
      .on('message', (message) => {
        console.log('updateFolders Message: ', message.result);
      })
      .on('error', (err) => {
        console.error('updateFoldera Worker error:', err);
      })
      .on('exit', (code) => {
        if (code !== 0) {
          const errorMessage = `Worker stopped with exit code ${code}`;
          console.error(errorMessage);
        }
      })
      .postMessage('');
  } catch (error) {
    console.error('Worker encountered an error:', error);

    console.log('Handling subsequent code after worker error.');
  }
}

async function updateFiles() {
  try {
    /* console.log('createUpdateFilesWorker', createUpdateFilesWorker()); */
    const workerPath = process.resourcesPath;
    await createUpdateFilesWorker({ workerData: workerPath })
      .on('message', (message) => {
        console.log('updateFiles Message: ', getObjectWithLengths(message.result));
      })
      .on('error', (err) => {
        console.error('Worker error:', err);
      })
      .on('exit', (code) => {
        if (code !== 0) {
          const errorMessage = `Worker stopped with exit code ${code}`;
          console.error(errorMessage);
        }
      })
      .postMessage('');
  } catch (error) {
    console.error('Worker encountered an error:', error);

    console.log('Handling subsequent code after worker error.');
  }
  return;
}

const capitalizeDriveLetter = (str) => {
  return `${str.charAt(0).toUpperCase()}:${str.slice(1)}`;
};

export let mainWindow;

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    frame: false,
    useContentSize: true,
    transparent: true,
    show: false,
    ...(process.platform === 'linux' ? { icon: path.join(__dirname, '../../build/icon.png') } : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      additionalArguments: [`--mainTheme=${mainTheme}`],
      sandbox: true,
      webSecurity: true,
      contextIsolation: true
      /* additionalArguments: [`--mainTheme=${mainTheme}`] */
      /* nodeIntegration: true */
    }
  });

  /*   mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  }); */

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  ipcMain.on('window-action', (event, action) => {
    console.log('window action: ', action);
    switch (action) {
      case 'close':
        mainWindow.close();
        break;
      case 'minimize':
        mainWindow.minimize();
        break;
      case 'maximize':
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

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/index.html`);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

function launchDevTools() {
  try {
    const bin = process.platform === 'win32' ? 'react-devtools.cmd' : 'react-devtools';

    const binPath = path.join(app.getAppPath(), 'node_modules', '.bin', bin);
    console.log('binPath: ', binPath);
    const bat = spawn(binPath, { shell: true });
    bat.unref(); // don't tie Electron lifecycle to DevTools
  } catch (e) {
    console.error('devtools error: ', e.message);
  }
}

/* launchDevTools(); */

app.whenReady().then(async () => {
  const createRootsTable = `CREATE TABLE IF NOT EXISTS roots ( id INTEGER PRIMARY KEY AUTOINCREMENT, root TEXT UNIQUE)`;
  db.exec(createRootsTable);

  /*   console.log('Using colors for menu:', colors.background, colors.foreground); */

  await session.defaultSession.clearCache().then(() => console.log('Cache cleared!'));

  electronApp.setAppUserModelId(process.execPath);

  console.log('Electron:', process.versions.electron);
  console.log('Chromium:', process.versions.chrome);
  console.log('Node:', process.versions.node);
  console.log('V8:', process.versions.v8);
  console.log(process.arch);

  getTheme();
  setTimeout(() => {
    getCurrentSchedule(); // ⚠️ delay to avoid slowing HMR boot
  }, 500);

  protocol.registerStreamProtocol('streaming', async (request, cb) => {
    try {
      const uri = decodeURIComponent(request.url);
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
          headers: { 'Content-Length': String(fileSize), 'Content-Type': 'audio/mpeg' },
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

  /* TO REPLACE REGISTER FILEPROTOCOL 
  protocol.handle('some-protocol', () => {
    return net.fetch('file:///path/to/my/file')
  })
    */

  /*   protocol.registerFileProtocol('cover', (request, callback) => {
    let url = decodeURI(request.url.substr(8));

    // If the URL is for a Windows path (e.g., starts with a drive letter), add the colon back after the drive letter
    if (/^[a-zA-Z]\//.test(url)) {
      url = `${url[0]}:${url.slice(1)}`;
    }

    const filePath = path.normalize(url);

    fs.access(filePath, fs.constants.F_OK, (err) => {
      if (err) {
        console.error('File does not exist:', filePath);
        callback({ error: -6 }); // -6 corresponds to FILE_NOT_FOUND
      } else {
        callback({ path: filePath });
      }
    });
  }); */

  /*   protocol.handle('cover', async (request) => {
    try {
      let url = decodeURI(request.url.substr(8));

      if (/^[a-zA-Z]\//.test(url)) {
        url = `${url[0]}:${url.slice(1)}`;
      }
      const filePath = path.normalize(url);
      await fs.promises.access(filePath);

      return net.fetch(`file:///${filePath}`);
    } catch (err) {
      console.log('error: ', err.message);
      throw new Error('FILE_NOT_FOUND');
    }
  }); */

  protocol.handle('cover', async (request) => {
    try {
      let url = decodeURI(request.url.substring(8));
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

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });
  // Create the initial window

  createWindow();
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  // Optional: Watch for window shortcuts if needed
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  initializeDatabase();
  mainWindow.show();
  /* mainWindow.webContents.openDevTools(); */
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.on('toggle-resizable', (event, isResizable) => {
  mainWindow.setResizable(isResizable);
  const [currentWidth, currentHeight] = mainWindow.getSize();
  if (isResizable) {
    mainWindow.setMinimumSize(currentWidth, currentHeight);
  }
});

ipcMain.handle('get-roots', async () => {
  const rootFolders = await getRoots();
  return rootFolders;
});

ipcMain.handle('update-roots', async (event, roots) => {
  try {
    const update = await updateRoots(roots);
    return update;
  } catch (error) {
    console.error(error.message);
  }
});

ipcMain.handle('get-folder-path', (event, folderName) => {
  /*  console.log('folderName: ', folderName); */
  return path.resolve(folderName);
});

/* ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0]; 
  } else {
    return null; 
  }
}); */

ipcMain.handle('update-folders', async () => {
  try {
    const workerPath = process.resourcesPath;
    await createUpdateFoldersWorker({ workerData: workerPath })
      .on('message', (message) => {
        //console.log('message from worker: ', message);
        mainWindow.webContents.send('update-complete', 'folders', message.result);
      })
      .on('error', (err) => {
        console.error('Worker error:', err);
        mainWindow.webContents.send('update-error', 'folders-error', { result: err.message });
      })
      .on('exit', (code) => {
        if (code !== 0) {
          const errorMessage = `Worker stopped with exit code ${code}`;
          console.error(errorMessage);
          mainWindow.webContents.send('update-error', 'folders-error', { result: errorMessage });
        }
      })
      .postMessage('');
  } catch (error) {
    console.error('Worker encountered an error:', error);

    console.log('Handling subsequent code after worker error.');
  }
});

function getObjectWithLengths(obj) {
  return {
    new: Array.isArray(obj.new) ? obj.new.length : 0,
    deleted: Array.isArray(obj.deleted) ? obj.deleted.length : 0,
    nochange: obj.nochange
  };
}

ipcMain.handle('update-files', async () => {
  try {
    /* console.log('createUpdateFilesWorker', createUpdateFilesWorker()); */
    const workerPath = process.resourcesPath;
    await createUpdateFilesWorker({ workerData: workerPath })
      .on('message', (message) => {
        //console.log('message from worker: ', message);
        mainWindow.webContents.send(
          'update-complete',
          'files',
          getObjectWithLengths(message.result)
        );
      })
      .on('error', (err) => {
        console.error('Worker error:', err);
        mainWindow.webContents.send('update-error', 'files-error', { result: err.message });
      })
      .on('exit', (code) => {
        if (code !== 0) {
          const errorMessage = `Worker stopped with exit code ${code}`;
          console.error(errorMessage);
          mainWindow.webContents.send('update-error', 'files-error', { result: errorMessage });
        }
      })
      .postMessage('');
  } catch (error) {
    console.error('Worker encountered an error:', error);

    console.log('Handling subsequent code after worker error.');
  }
  return;
});

ipcMain.handle('update-meta', async () => {
  /* const senderWebContents = event.sender;
  const senderWindow = BrowserWindow.fromWebContents(senderWebContents);
  const targetWindow = BrowserWindow.fromId(senderWindow.id); */

  try {
    const workerPath = process.resourcesPath;
    await createUpdateMetadataWorker({ workerData: workerPath })
      .on('message', (message) => {
        //console.log('message from worker: ', message);
        mainWindow.webContents.send(
          'update-complete',
          'metadata',
          //getObjectWithLengths(message.result)
          message.result
        );
      })
      .on('error', (err) => {
        console.error('Worker error:', err);
        mainWindow.webContents.send('update-error', 'meta-error', { result: err.message });
      })
      .on('exit', (code) => {
        if (code !== 0) {
          const errorMessage = `Worker stopped with exit code ${code}`;
          console.error(errorMessage);
          mainWindow.webContents.send('update-error', 'meta-error', { result: errorMessage });
        }
      })
      .postMessage('');
  } catch (error) {
    console.error('Worker encountered an error:', error);
    console.log('Handling subsequent code after worker error.');
  }
});

/* function escapeSpecialChars(path) {
  return path.replace(/[\[\]\(\)]/g, '\\$&');
} */
ipcMain.handle('update-covers', async () => {
  //console.log('update-covers');
  try {
    /* console.log('createUpdateFilesWorker', createUpdateFilesWorker()); */
    const workerPath = process.resourcesPath;
    await createUpdateCoversWorker({ workerData: workerPath })
      .on('message', (message) => {
        //console.log('message from worker: ', message);
        mainWindow.webContents.send('update-complete', 'covers', message.result);
      })
      .on('error', (err) => {
        console.error('Worker error:', err);
        mainWindow.webContents.send('update-error', 'covers-error', { result: err.message });
      })
      .on('exit', (code) => {
        if (code !== 0) {
          const errorMessage = `Worker stopped with exit code ${code}`;
          console.error(errorMessage);
          mainWindow.webContents.send('update-error', 'covers-error', { result: errorMessage });
        }
      })
      .postMessage('');
  } catch (error) {
    console.error('Worker encountered an error:', error);

    console.log('Handling subsequent code after worker error.');
  }
});

ipcMain.handle('get-tracks', async (event, ...args) => {
  if (args[1] === '') {
    const alltracks = await allTracksByScroll(args[0], args[2]);
    return alltracks;
  } else if (args[1]) {
    const alltracks = await allTracksBySearchTerm(args[0], args[1], args[2]);
    return alltracks;
  }
});

ipcMain.handle('get-albums', async (event, ...args) => {
  if (args[1] === '') {
    const allAlbums = await allAlbumsByScroll(args[0], args[2]);
    return allAlbums;
  } else {
    const allAlbums = await allAlbumsBySearchTerm(args[0], args[1], args[2]);
    return allAlbums;
  }
});

/* ipcMain.handle('get-album', async (_, args) => {
  const album = getAlbum(args);
  return album;
});
 */
ipcMain.handle('get-album-tracks', async (event, args) => {
  //console.log('get-album-tracks');
  const allAlbumTracks = await filesByAlbum(args);
  //console.log('album-tracks: ', allAlbumTracks);
  return allAlbumTracks;
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

ipcMain.handle('get-cover', async (event, arg) => {
  const trackDirectory = path.dirname(arg);
  const trackRoot = getRoot(trackDirectory);

  const myFile = await File.createFromPath(arg);

  if (myFile.tag.pictures?.[0]?.data) {
    return myFile.tag.pictures[0].data._bytes;
  }

  const folderCover = await searchCover(trackDirectory);
  if (folderCover) {
    return folderCover;
  }

  if (trackRoot.length > 0) {
    const coverResults = await searchCover(trackRoot);
    if (coverResults) {
      return coverResults;
    }
  }

  return 0;
});

ipcMain.on('screen-mode', async (event, ...args) => {
  if (args[0] === 'mini') {
    await mainWindow.setMinimumSize(290, 350);
    await mainWindow.setSize(290, 350, false);
  }
  if (args[0] === 'player-library') {
    await mainWindow.setMinimumSize(660, 500);
    await mainWindow.setSize(660, 500, false);
  }
  if (args[0] === 'player') {
    await mainWindow.setMinimumSize(300, 500);
    await mainWindow.setSize(300, 500, false);
  }
  if (args[0] === 'mini-expanded') {
    await mainWindow.setMinimumSize(380, 620);
    await mainWindow.setSize(380, 620, false);
  }
  if (args[0] === 'default') {
    await mainWindow.setMinimumSize(800, 600);
    await mainWindow.setSize(800, 600, true);
  }
});

ipcMain.handle('update-like', async (event, ...args) => {
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

ipcMain.handle('is-liked', async (event, arg) => {
  const checkIsLiked = await isLiked(arg);
  return checkIsLiked;
});

ipcMain.handle('total-tracks-stat', async () => {
  const totals = await totalTracks();
  const totalCounts = {
    albums: totals.albumsInfo['COUNT(*)'],
    tracks: totals.tracksInfo['COUNT(*)']
  };
  return totalCounts;
});

ipcMain.handle('top-hundred-artists-stat', async () => {
  const topHundred = await topHundredArtists();
  return topHundred.slice(1);
});

async function openWindowAndSendData(queryResults, listType) {
  const targetWindow = await getWindow('table-data');

  if (targetWindow) {
    if (targetWindow.webContents.isLoading()) {
      /* targetWindow.webContents.sent('sending-row-data', 'sending-row-data'); */
      targetWindow.webContents.once('did-finish-load', () => {
        targetWindow.webContents.send('send-to-child', { listType, results: queryResults });
      });
    } else {
      targetWindow.webContents.send('send-to-child', { listType, results: queryResults });
    }
  } else {
    console.error('Target window not found');
  }
}

ipcMain.handle('get-tracks-by-category', async (event, obj) => {
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

ipcMain.handle('distinct-directories', async () => {
  try {
    const dirs = await distinctDirectories();
    return dirs;
  } catch (e) {
    console.log(e.message);
  }
});

ipcMain.handle('get-tracks-by-root', async (event, root, listType) => {
  try {
    const rootTracks = await allTracksByRoot(root);
    await openWindowAndSendData(rootTracks, listType);
  } catch (e) {
    console.error(e.message);
  }
});

ipcMain.handle('check-for-open-table', async (event, name) => {
  const names = await getWindowNames();
  if (names.includes(name)) {
    return true;
  }
  return false;
});

ipcMain.handle('clear-table', async () => {
  const targetWindow = await getWindow('table-data');
  targetWindow.webContents.send('clear-table', 'clear');
});

ipcMain.handle('get-albums-by-root', async (event, dirs) => {
  const results = await albumsByTopFolder(dirs);
  return results;
});

ipcMain.handle('genres-stat', async () => {
  const genres = await genresWithCount();
  return genres;
});

/* ipcMain.handle('folders-stat', async (event, dirs) => {
  const folders = await foldersWithCount(dirs);
  return folders;
}); */

ipcMain.handle('open-playlist', async () => {
  const open = await dialog.showOpenDialog(mainWindow, {
    defaultPath: playlistsFolder,
    properties: ['openFile'],
    filters: [{ name: 'Playlist', extensions: ['m3u'] }]
  });
  if (open.canceled) return 'action cancelled';
  const plfiles = await fs.promises.readFile(open.filePaths.join(), 'utf8');
  const parsedPlFiles = plfiles.replaceAll('\\', '/').split('\n');
  return getPlaylist(parsedPlFiles);
});

/* ipcMain.handle('save-playlist', async (_, args) => {
  const save = await dialog.showSaveDialog(mainWindow, {
    defaultPath: playlistsFolder,
    filters: [{ name: 'Playlist', extensions: ['m3u'] }]
  });

  if (save.canceled) return 'action cancelled';

  args.forEach((a, index) => {
    const tmp = a.audiotrack.replaceAll('/', '\\');
    if (index === args.length - 1) {
      fs.writeFileSync(save.filePath, `${tmp}`, {
        flag: 'a'
      });
    } else {
      fs.writeFileSync(save.filePath, `${tmp}\n`, {
        flag: 'a'
      });
    }
  });

  const show = await dialog.showMessageBox(mainWindow, {
    message: `Saved playlist ${path.basename(save.filePath)}`,
    buttons: []
  });
}); */

ipcMain.handle('save-playlist', async (_, args) => {
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

/* ipcMain.handle('get-playlists', async () => {
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

ipcMain.handle('get-temp-path', async () => {
  return app.getPath('temp');
});

/* ipcMain.handle('homepage-playlists', async (_m, ...args) => {
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

ipcMain.handle('get-covers', async (_, ...args) => {
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

ipcMain.handle('set-shuffled-tracks-array', async () => {
  shuffled = [];
  const primaryKeysArray = getAllPkeys();
  shuffled = shuffle(primaryKeysArray);
});

ipcMain.handle('get-shuffled-tracks', async (_, ...args) => {
  const offset = args[0];
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

ipcMain.handle('update-tags', async (event, arr) => {
  /* console.log('update tags handler: ', arr); */
  const senderWebContents = event.sender;
  const senderWindow = BrowserWindow.fromWebContents(senderWebContents);
  const targetWindow = BrowserWindow.fromId(senderWindow.id);
  /*   console.log(
    `Request received from window ID: ${senderWindow.id}, Title: ${senderWindow.getTitle()}`
  ); */
  targetWindow.webContents.send('updated-tags', { status: 'starting' });
  try {
    const workerPath = process.resourcesPath;
    await createUpdateTagsWorker({ workerData: { workerPath: workerPath, data: arr } })
      .on('message', (message) => {
        /*  console.log('update tags: ', message); */
        targetWindow.webContents.send('updated-tags', message);
        mainWindow.webContents.send('updated-tags', 'updated-tags');
      })
      .on('error', (err) => {
        console.error('Tags worker error: ', err);
        targetWindow.webContents.send('updated-tags', 'error processing');
      })
      .on('exit', (code) => {
        if (code !== 0) {
          const errorMessage = `Worker stopped with exit code ${code}`;
          console.error(errorMessage);
        }
      })
      .postMessage('');
  } catch (error) {
    console.error('Error on tag update: ', error.message);
  }
});

ipcMain.on('show-context-menu', (event, id, type) => {
  /* console.log('type: ', type, 'id: ', id); */
  /* console.log('show-context-menu: ', id, '----', type); */
  const template = [];

  // Add items based on the 'type'
  if (type === 'files') {
    template.push(
      {
        label: 'Add Track to Playlist',
        click: () => event.sender.send('context-menu-command', 'add-track-to-playlist')
      },
      { type: 'separator' },
      {
        label: 'Edit Track Metadata',
        click: () => event.sender.send('context-menu-command', 'edit-track-metadata')
      }
    );
  }

  if (type === 'folder') {
    template.push(
      {
        label: 'Add Album to Playlist',
        click: () => event.sender.send('context-menu-command', 'add-album-to-playlist')
      },
      { type: 'separator' },
      {
        label: 'Open Album Folder',
        click: () => event.sender.send('context-menu-command', 'open-album-folder')
      }
    );
  }

  if (type === 'playlist') {
    template.push(
      {
        label: 'Remove from Playlist',
        click: () => event.sender.send('context-menu-command', 'remove-from-playlist')
      },
      { type: 'separator' },
      {
        label: 'Edit Track Metadata',
        click: () => event.sender.send('context-menu-command', 'edit-track-metadata')
      }
    );
  }

  if (type === 'cover') {
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
      /*   {
        label: `Get image for selected tracks`,
        click: () =>
          event.sender.send('context-menu-command', {
            type: 'all-tracks',
            params: 'all-tracks'
          })
      }, */
      {
        label: 'Select image from folder for single track',
        click: () =>
          event.sender.send('context-menu-command', { type: 'search-folder-single', params: id })
      }
      /* {
        label: 'Select image from folder for selected tracks',
        click: () =>
          event.sender.send('context-menu-command', {
            type: 'search-folder-all-tracks',
            params: 'search-folder-all-tracks'
          })
      } */
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
        label: `Schedule Updates`,
        click: () => event.sender.send('hamburger-menu-command', 'schedule-updates')
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
        label: 'Update Meta',
        click: () => event.sender.send('hamburger-menu-command', 'update-meta')
      },
      {
        label: 'Setup / Modify',
        click: () => event.sender.send('hamburger-menu-command', 'setup / modify')
      },
      {
        label: 'Theme Preferences',
        click: () => event.sender.send('hamburger-menu-command', 'theme-preferences')
      }
    );
  }

  // Create and show the context menu
  const menu = Menu.buildFromTemplate(template);
  menu.popup(BrowserWindow.fromWebContents(event.sender));
});

ipcMain.handle('show-album-cover-menu', (event, path, folder) => {
  /* console.log('show album cover menu: ', path, folder); */
  const template = [
    {
      label: 'add album to playlist',
      click: () => {
        return event.sender.send('album-menu', 'add album to playlist', path, folder);
      }
    },
    { type: 'separator' },
    {
      label: 'open album folder',
      click: () => {
        return event.sender.send('album-menu', 'open album folder', path, folder);
      }
    },
    { type: 'separator' },
    {
      label: 'cover search',
      click: () => {
        return event.sender.send('album-menu', 'cover search', path, folder);
      }
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  menu.popup(BrowserWindow.fromWebContents(event.sender));
});

ipcMain.handle('show-text-input-menu', (event) => {
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

ipcMain.handle('show-child', (event, args) => {
  const { name, type, winConfig, data } = args;
  createOrUpdateChildWindow(name, type, winConfig, data /* , theme */);
});

// Helper function for downloading and saving
const downloadFile = async (fileUrl, savePath) => {
  /* console.log('save-path: ', savePath); */
  try {
    const response = await axios.get(fileUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'musicplayer-electron/1.0 +https://stuartambient.github.io/musicapp-intro/'
      }
    });

    if (response.status === 200) {
      await fs.promises.writeFile(savePath, response.data);
      /* console.log('Download complete:', savePath); */
      return true;
    } else {
      /* console.log('Failed to download:', response.status); */
      return false;
    }
  } catch (err) {
    console.error('Error during download or save:', err);
    throw new Error(`Error: ${err.message}`);
  }
};

ipcMain.handle('download-file', async (event, ...args) => {
  const [fileUrl, filePath] = args;

  const extension = path.extname(new URL(fileUrl).pathname);
  const defaultFilename = `cover${extension}`;
  const initialPath = filePath ? path.join(filePath, defaultFilename) : defaultFilename;

  let savePath = await dialog.showSaveDialog({
    title: 'save image',
    defaultPath: initialPath,
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
    properties: ['showOverwriteConfirmation']
  });

  if (savePath.canceled) {
    /* console.log('Download canceled by user.'); */
    event.sender.send('download-completed', 'download cancelled');
  }

  try {
    await downloadFile(fileUrl, savePath.filePath).then(() =>
      event.sender.send('download-completed', 'download successful')
    );
  } catch (error) {
    console.error(error.message);
    event.sender.send('download-failed', 'download failed');
  }
});

ipcMain.handle('download-tag-image', async (event, ...args) => {
  /* console.log('download-tag-image: ====>', args); */

  const coverSearchWindow = getWindow('cover-search-alt-tags');
  const targetWindow = await getWindow('table-data');

  const [fileUrl, filePath, delayDownload] = args;
  console.log('fileUrl: ', fileUrl, 'filePath: ', filePath, 'delayDownload: ', delayDownload);
  const tempKey = crypto.randomBytes(16).toString('hex');
  /*  if (!delayDownload) {
    targetWindow.webContents.send('update-tags', 'starting');
  } */
  const extension = path.extname(new URL(fileUrl).pathname);
  const defaultFilename = `cover-${tempKey}${extension}`;
  const tempDir = app.getPath('temp');
  const saveTo = path.join(tempDir, defaultFilename);

  const success = await downloadFile(fileUrl, saveTo);
  if (success) {
    const tempFile = saveTo.replace(/\\/g, '/');
    if (delayDownload) {
      coverSearchWindow.webContents.send('download-completed', 'download-successful');
      return targetWindow.webContents.send('for-submit-form', { tempFile, filePath });
    }
    /*     try {
      const workerPath = process.resourcesPath;
      await createUpdateTagImageWorker({
        workerData: { workerPath: workerPath, data: { tempFile, filePath } }
      })
        .on('message', () => {
          targetWindow.webContents.send('update-tags', 'image(s) updated');
          coverSearchWindow.webContents.send('download-completed', 'download-successful');
          //mainWindow.webContents.send('file-update-complete', getObjectWithLengths(message.result));
        })
        .on('error', (err) => {
          console.error('Worker error:', err);
          targetWindow.webContents.send('update-tags', 'error processing');
          coverSearchWindow.webContents.send('download-completed', 'download-cancelled');
        })
        .on('exit', (code) => {
          if (code !== 0) {
            const errorMessage = `Worker stopped with exit code ${code}`;
            console.error(errorMessage);
          }
        })
        .postMessage('');
    } catch (error) {
      console.error(error.message);
    } */
  }
});

ipcMain.handle('select-image-from-folder', async (event, arr, delayDownload = false) => {
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

ipcMain.handle('refresh-cover', async (event, ...args) => {
  const [file, filepath] = args;
  const imgurl = url.pathToFileURL(file).href;
  /* const imageobj = { img: imgurl.href }; */

  BrowserWindow.fromId(mainWindow.id).webContents.send('refresh-home-cover', filepath, imgurl);
});

ipcMain.handle('open-album-folder', async (_, path) => {
  /* console.log('open-album-folder'); */
  try {
    const properPath = path.replaceAll('/', '\\');
    return shell.openPath(properPath);
  } catch (error) {
    console.error(error.message);
  }
});

ipcMain.handle('get-preferences-sync', () => {
  /* console.log('sync-called'); */
  const prefs = getPreferencesSync();
  return prefs;
});

ipcMain.handle('get-preferences', async () => {
  try {
    const prefs = await getPreferences();
    return prefs;
  } catch (e) {
    console.log('get preferences error: ', e);
  }
});

ipcMain.handle('save-preferences', async (event, preferences) => {
  console.log('---------> save-preferences');
  try {
    const saveResults = await savePreferences(preferences);
    if (preferences.schedule) {
      getCurrentSchedule();
    } else if (preferences.theme) {
      getTheme();
    } else if (preferences.mainTheme) {
      /* mainTheme = preferences.mainTheme; */
      event.sender.send('main-theme-updated');
      getTheme();
      global.currentTheme = `.${mainTheme}`;
      /* mainWindow.webContents.navigationHistory.goBack(); */
      /* console.log('content: ', mainWindow.webContents.navigationHistory); */
    }

    return saveResults;
  } catch (error) {
    console.error(error);
  }
});

/* ipcMain.handle('send-track-notification', async (event, track) => {
  console.log('track-----> : ', track);
  new Notification({ title: track.title || 'Now Playing', body: `Artist: ${track.artist}` }); 
  new Notification({ title: track.title, body: track.body, icon: track.icon }).show();
});
 */
