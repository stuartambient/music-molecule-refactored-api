import { app } from 'electron';
import os from 'node:os';
import process from 'node:process';
import { appPaths } from './appPaths.js';

export const paths = appPaths({
  platform: process.platform,
  env: process.env,
  home: os.homedir(),
  appData: app.getPath('appData'),
  userData: app.getPath('userData'),
  logs: app.getPath('logs'),
  resources: process.resourcesPath
});
