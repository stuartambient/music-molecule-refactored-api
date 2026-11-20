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

// Each caller resolves only after its own patch is persisted. Concurrent theme and grid
// updates must not replace each other or broadcast preferences before they reach disk.
let pendingWrites = Promise.resolve();
export const savePreferences = (newPreferences) => {
  const write = pendingWrites.then(async () => {
    const currentPreferences = await readPreferencesSafe();
    await writePreferencesAtomic({ ...currentPreferences, ...newPreferences });
    return true;
  });
  pendingWrites = write.catch(() => {});
  return write.catch((error) => {
    console.error('Error writing preferences:', error);
    return false;
  });
};
