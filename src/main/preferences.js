import { promises as fs } from 'fs';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const __dirname = path.resolve();
const preferencesPath =
  import.meta.env.MODE === 'development'
    ? path.join(__dirname, 'src', 'main', 'preferences.json')
    : path.join(process.resourcesPath, 'preferences.json');

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

export const savePreferences = async (newPreferences) => {
  /*  console.log('new preferences, ', newPreferences); */
  try {
    let currentPreferences = {};
    if (await fs.stat(preferencesPath)) {
      const data = await fs.readFile(preferencesPath, 'utf-8');
      currentPreferences = JSON.parse(data);
      /* console.log('SAVE PREFS: -----> ', currentPreferences); */
    }
    const updatedPreferences = { ...currentPreferences, ...newPreferences };
    await fs.writeFile(preferencesPath, JSON.stringify(updatedPreferences, null, 2));
    return true;
  } catch (err) {
    console.error('Error writing preferences:', err);
  }
};
