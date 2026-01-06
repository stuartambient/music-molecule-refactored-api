import { promises as fs } from 'fs';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { paths } from './paths.js';

const __dirname = path.resolve();
const preferencesPath =
  import.meta.env.MODE === 'development'
    ? path.join(__dirname, 'src', 'main', 'preferences.json')
    : paths.preferences;

async function readPreferencesSafe() {
  try {
    const data = await fs.readFile(preferencesPath, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function writePreferencesAtomic(prefs) {
  const tmpPath = `${preferencesPath}.tmp`;
  const json = JSON.stringify(prefs, null, 2);

  await fs.writeFile(tmpPath, json, 'utf8');
  await fs.rename(tmpPath, preferencesPath);
}

export const getPreferences = async () => {
  try {
    if (await fs.stat(preferencesPath)) {
      const data = await fs.readFile(preferencesPath, 'utf-8');
      /* console.log('preferences: ', JSON.parse(data)); */
      /* console.log('GET PREFS: ', JSON.parse(data)); */
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading preferences:', err);
  }
  return {}; // default preferences
};

export const getPreferencesSync = () => {
  try {
    if (existsSync(preferencesPath)) {
      const data = readFileSync(preferencesPath, 'utf-8');
      if (data.trim()) {
        return JSON.parse(data);
      }
    }
  } catch (err) {
    console.error('Error reading preferences (sync):', err);
  }
  return {}; // default preferences
};

let writeInProgress = false;
let pendingPreferences = null;

export const savePreferences = async (newPreferences) => {
  console.log('new preferences, ', newPreferences);
  /*   try {
    let currentPreferences = {};
    if (await fs.stat(preferencesPath)) {
      const data = await fs.readFile(preferencesPath, 'utf-8');
      currentPreferences = JSON.parse(data);
    }
    const updatedPreferences = { ...currentPreferences, ...newPreferences };
    await fs.writeFile(preferencesPath, JSON.stringify(updatedPreferences, null, 2));
    return true;
  } catch (err) {
     console.error('Error writing preferences:', err); 
  } */

  pendingPreferences = newPreferences;

  // If a write is already happening, just record the latest request
  if (writeInProgress) {
    return true;
  }

  writeInProgress = true;

  try {
    while (pendingPreferences) {
      const next = pendingPreferences;
      pendingPreferences = null;

      const currentPreferences = await readPreferencesSafe();

      const updatedPreferences = {
        ...currentPreferences,
        ...next
      };

      await writePreferencesAtomic(updatedPreferences);
    }

    return true;
  } catch (err) {
    console.error('Error writing preferences:', err);
  } finally {
    writeInProgress = false;
  }
};
