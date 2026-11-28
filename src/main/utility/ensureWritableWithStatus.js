import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { execFile } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function restoreReadOnlyWindows(filePath) {
  return new Promise((resolve, reject) => {
    execFile('attrib', ['+R', filePath], (err) => {
      if (err) {
        return reject(err);
      }
      resolve(true);
    });
  });
}

async function hasReadOnlyAttribute(filePath) {
  try {
    const { stdout } = await execFileAsync('attrib', [filePath]);
    const match = stdout.match(/^\s*([A-Z]+)\s+/);
    if (!match) return false;
    return match[1].includes('R');
  } catch {
    return false;
  }
}

function removeReadOnlyWindows(filePath) {
  return new Promise((resolve, reject) => {
    execFile('attrib', ['-R', filePath], (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
}

export async function ensureWritableWithStatus(
  filePath,
  { platform = os.platform(), fileSystem = fsp } = {}
) {
  let hadReadOnly = false;

  // 1️⃣ Check real OS write permission
  try {
    await fileSystem.access(filePath, fs.constants.W_OK);
  } catch (err) {
    if (['ENOENT', 'ENOTDIR'].includes(err?.code)) {
      return { status: 'missing', hadReadOnly: false, error: err };
    }

    // Attempt Windows read-only attribute correction.
    if (platform === 'win32') {
      hadReadOnly = await hasReadOnlyAttribute(filePath);
      if (hadReadOnly) {
        await removeReadOnlyWindows(filePath);
      }
    } else {
      // Respect Unix ownership/mode bits; do not broaden access to an audio file.
      return { status: 'unwritable', hadReadOnly: false, error: err };
    }

    // 3️⃣ Re-check permission
    try {
      await fileSystem.access(filePath, fs.constants.W_OK);
    } catch (err2) {
      return { status: 'unwritable', hadReadOnly, error: err2 };
    }
  }

  // 4️⃣ Detect Windows file locks (sharing violation)
  try {
    const handle = await fileSystem.open(filePath, 'r+');
    await handle.close();
  } catch (err3) {
    return { status: platform === 'win32' ? 'locked' : 'unwritable', hadReadOnly, error: err3 };
  }

  return {
    status: hadReadOnly ? 'changed-to-writable' : 'writable',
    hadReadOnly
  };
}
