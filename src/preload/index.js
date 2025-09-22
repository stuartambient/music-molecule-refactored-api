import { contextBridge, ipcRenderer } from 'electron';

const mainThemeArg = process.argv.find((arg) => arg.startsWith('--mainTheme='));
const initialMainTheme = mainThemeArg ? mainThemeArg.split('=')[1] : 'basic';

contextBridge.exposeInMainWorld('initialMainTheme', initialMainTheme);

contextBridge.exposeInMainWorld('ipcApi', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  on: (channel, listener) => {
    ipcRenderer.on(channel, (event, ...args) => listener(...args));
  },
  once: (channel, listener) => {
    ipcRenderer.once(channel, (event, ...args) => listener(...args));
  },
  off: (channel, listener) => ipcRenderer.removeListener(channel, listener)
});

contextBridge.exposeInMainWorld('api', {
  /*  updateFiles: () => ipcRenderer.invoke('update-files'),
  updateFolders: () => ipcRenderer.invoke('update-folders'),
  updateCovers: () => ipcRenderer.invoke('update-covers'), */
  /* getTracks: (page, term, sort) => ipcRenderer.invoke('get-tracks', page, term, sort), */
  /* getAlbums: (page, term, sort) => ipcRenderer.invoke('get-albums', page, term, sort), */
  //getAlbum: (id) => ipcRenderer.invoke('get-album', id),
  /* getAlbumTracks: (pattern) => ipcRenderer.invoke('get-album-tracks', pattern), */
  /* getCover: (trackid) => ipcRenderer.invoke('get-cover', trackid), */
  /* windowAction: (action) => ipcRenderer.send('window-action', action), */
  /*  screenMode: (size) => ipcRenderer.invoke('screen-mode', size), */
  /* updateLike: (id) => ipcRenderer.invoke('update-like', id), */
  /* isLiked: (id) => ipcRenderer.invoke('is-liked', id), */
  /* totalTracksStat: () => ipcRenderer.invoke('total-tracks-stat'), */
  /* topHundredArtistsStat: () => ipcRenderer.invoke('top-hundred-artists-stat'),
  last10AlbumsStat: () => ipcRenderer.invoke('last-10Albums-stat'),
  last100TracksStat: () => ipcRenderer.invoke('last-100Tracks-stat'), */
  /* openPlaylist: () => ipcRenderer.invoke('open-playlist'), */
  /* savePlaylist: (playlistTracks) => ipcRenderer.invoke('save-playlist', playlistTracks), */
  //getPlaylists: () => ipcRenderer.invoke('get-playlists'),
  /*   getCovers: (coversPageNum, coversSearchTerm, coversDateSort, coversMissingReq) =>
    ipcRenderer.invoke(
      'get-covers',
      coversPageNum,
      coversSearchTerm,
      coversDateSort,
      coversMissingReq
    ), */
  /* setShuffledTracksArray: () => ipcRenderer.invoke('set-shuffled-tracks-array'), */
  /* getShuffledTracks: (start, end) => ipcRenderer.invoke('get-shuffled-tracks', start, end), */
  /* showAlbumCoverMenu: (path, folder) => ipcRenderer.invoke('show-album-cover-menu', path, folder), */
  /* showTextInputMenu: () => ipcRenderer.invoke('show-text-input-menu'), */
  /* onEditTrackMetadata: (cb) => ipcRenderer.once('edit-metadata', (event, args) => cb(args)), */
  onRemoveFromPlaylist: (cb) =>
    ipcRenderer.once('remove-from-playlist', (event, ...args) => cb(args)),
  showChild: (args) => ipcRenderer.invoke('show-child', args),
  onRefreshHomeCover: (cb) => ipcRenderer.on('refresh-home-cover', (event, ...args) => cb(args)),
  openAlbumFolder: (path) => ipcRenderer.invoke('open-album-folder', path),
  /* updateMeta: () => ipcRenderer.invoke('update-meta'), */
  genresStat: () => ipcRenderer.invoke('genres-stat'),
  distinctDirectories: () => ipcRenderer.invoke('distinct-directories'),
  /*   getTracksByArtist: (listType, artist) =>
    ipcRenderer.invoke('get-tracks-by-artist', listType, artist), */
  getTracksByCategory: (listType, value) =>
    ipcRenderer.invoke('get-tracks-by-category', { listType, value }),
  onTracksLoaded: (cb) => ipcRenderer.on('tracks-loaded', (event, msg) => cb(msg)),

  /* getTracksByGenre: (listType, genre) => ipcRenderer.invoke('get-tracks-by-genre', listType, genre), */
  getTracksByRoot: (root, listType) => ipcRenderer.invoke('get-tracks-by-root', root, listType),
  /* getTracksByAlbum: (listType, album) => ipcRenderer.invoke('get-tracks-by-album', listType, album), */
  onTracksByAlbumLoaded: (cb) => ipcRenderer.on('album-tracks-loaded', (event, arg) => cb(arg)),
  onTracksByGenreLoaded: (cb) => ipcRenderer.on('genre-tracks-loaded', (event, arg) => cb(arg)),
  onTracksByArtistLoaded: (cb) => ipcRenderer.on('artist-tracks-loaded', (event, arg) => cb(arg)),
  showContextMenu: (id, itemType) => ipcRenderer.send('show-context-menu', id, itemType),
  /*   onContextMenuCommand: (callback) => {
    ipcRenderer.once('context-menu-command', (event, command) => callback(command));
    return () => ipcRenderer.removeAllListeners('context-menu-command'); // Cleanup
  }, */
  onAlbumCoverMenu: (cb) => {
    ipcRenderer.on('album-menu', (event, ...args) => cb(args));
  },
  getAlbumsByRoot: (roots) => ipcRenderer.invoke('get-albums-by-root', roots),
  /* toggleResizable: (isResizable) => ipcRenderer.send('toggle-resizable', isResizable), */
  checkForOpenTable: (name) => ipcRenderer.invoke('check-for-open-table', name),
  clearTable: () => ipcRenderer.invoke('clear-table'),
  onUpdatedTags: (cb) => ipcRenderer.on('updated-tags', (event, msg) => cb(msg)),
  onChildWindowClosed: (cb) => ipcRenderer.on('window-closed', (event, name) => cb(name)),
  getPreferences: () => ipcRenderer.invoke('get-preferences'),
  savePreferences: (preferences) => ipcRenderer.invoke('save-preferences', preferences),
  onTrackLiked: (cb) => ipcRenderer.on('track-liked', (event, msg) => cb(msg)),
  onTrackLikeRemoved: (cb) => ipcRenderer.on('track-like-removed', (event, msg) => cb(msg)),
  onMainThemeUpdate: (cb) => ipcRenderer.on('main-theme-updated', (event, msg) => cb(msg)),
  sendTrackNotification: (track) => {
    console.log('track notice: ', track);
    ipcRenderer.invoke('send-track-notification', track);
  },
  /* onUpdateFiles: (cb) => {
    ipcRenderer.on('file-update-complete', (event, result) => {
      cb(result);
    });
  },
  onUpdateFolders: (cb) => {
    ipcRenderer.on('update-complete', (event, type, result) => {
      cb(result);
    });
  },
  onUpdateMetadata: (cb) => {
    ipcRenderer.on('meta-update-complete', (event, result) => {
      cb(result);
    });
  },
  onUpdateCovers: (cb) => {
    ipcRenderer.on('cover-update-complete', (event, result) => {
      cb(result);
    });
  }, */
  removeChildWindowClosedListener: (callback) => {
    ipcRenderer.removeListener('window-closed', callback);
  },
  getState: () => ipcRenderer.invole('get-prefernces'),
  saveState: (preferences) => {
    console.log('prefs: ', preferences);
    ipcRenderer.invoke('save-preferences', preferences);
  },
  onHamburgerMenuCommand: (cb) =>
    ipcRenderer.on('hamburger-menu-command', (event, command) => {
      cb(command);
    }),
  getRoots: () => ipcRenderer.invoke('get-roots'),
  updateRoots: (roots) => ipcRenderer.invoke('update-roots', roots),
  getFolderPath: (folderName) => ipcRenderer.invoke('get-folder-path', folderName),
  onUpdateComplete: (cb) => {
    ipcRenderer.on('update-complete', (event, type, result) => {
      cb(type, result);
    });
  },
  onUpdateError: (cb) => {
    ipcRenderer.on('update-error', (event, type, result) => {
      cb(type, result);
    });
  },
  off: (channel, callback) => ipcRenderer.removeListener(channel, callback)
});
