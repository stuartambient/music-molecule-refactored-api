import { app } from 'electron';
import path from 'path';

const localDataRoot = path.join(app.getPath('appData'), '..', 'Local', 'Music Molecule Data');
export const paths = {
  // --- user-writable, synced ---
  userData: app.getPath('userData'),
  preferences: path.join(app.getPath('userData'), 'preferences.json'),
  playlists: path.join(app.getPath('userData'), 'playlists'),

  // --- large, not synced ---
  db: path.join(localDataRoot, 'music.db'),
  backups: path.join(localDataRoot, 'backups'),

  // --- system paths ---
  logs: app.getPath('logs'),
  resources: process.resourcesPath
};
