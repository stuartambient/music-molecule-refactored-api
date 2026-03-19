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

export async function ensureWritableWithStatus(filePath) {
  let hadReadOnly = false;

  // 1️⃣ Check real OS write permission
  try {
    await fsp.access(filePath, fs.constants.W_OK);
  } catch (err) {
    if (err?.code === 'ENOENT') {
      return { status: 'missing', hadReadOnly: false, error: err };
    }

    // 2️⃣ Attempt attribute / chmod correction
    if (os.platform() === 'win32') {
      hadReadOnly = await hasReadOnlyAttribute(filePath);
      if (hadReadOnly) {
        await removeReadOnlyWindows(filePath);
      }
    } else {
      await fsp.chmod(filePath, 0o666);
    }

    // 3️⃣ Re-check permission
    try {
      console.log('constants?', fs.constants?.W_OK);
      await fsp.access(filePath, fs.constants.W_OK);
    } catch (err2) {
      return { status: 'unwritable', hadReadOnly, error: err2 };
    }
  }

  // 4️⃣ Detect Windows file locks (sharing violation)
  try {
    const handle = await fsp.open(filePath, 'r+');
    await handle.close();
  } catch (err3) {
    return { status: 'locked', hadReadOnly, error: err3 };
  }

  return {
    status: hadReadOnly ? 'changed-to-writable' : 'writable',
    hadReadOnly
  };
}
