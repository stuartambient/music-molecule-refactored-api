// devtools.js
import path from 'path';
import fs from 'fs';

export default function getLatestReactDevToolsPath() {
  const baseDir = path.join(
    process.env.LOCALAPPDATA,
    'Google/Chrome/User Data/Default/Extensions/fmkadmapgofadopljbjfkapdkoienihi'
  );

  if (!fs.existsSync(baseDir)) {
    console.warn('[DevTools] React DevTools extension folder not found:', baseDir);
    return null;
  }

  // get all version folders (e.g. 6.1.5_0, 6.0.0_0, etc.)
  const versions = fs.readdirSync(baseDir).filter((f) => {
    return fs.statSync(path.join(baseDir, f)).isDirectory();
  });

  if (versions.length === 0) {
    console.warn('[DevTools] No version folders found under:', baseDir);
    return null;
  }

  // pick the latest by lexicographic sort (Chrome extension versions sort correctly this way)
  const latest = versions.sort().pop();
  return path.join(baseDir, latest);
}

/* export async function installReactDevTools() {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  app.whenReady().then(async () => {
    const devToolsPath = getLatestReactDevToolsPath();
    if (!devToolsPath) return;

    try {
      const ext = await session.defaultSession.extensions.loadExtension(devToolsPath, {
        allowFileAccess: true,
      });
      console.log(`[DevTools] Loaded ${ext.name} v${ext.version}`);
    } catch (err) {
      console.error('[DevTools] Failed to load React DevTools:', err);
    }
  });
}
 */
