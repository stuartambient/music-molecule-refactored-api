import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import os from 'node:os';

export function restoreReadOnlyWindows(filePath) {
  console.log('restore: ', filePath);
  return new Promise((resolve, reject) => {
    execFile('attrib', ['+R', filePath], (err) => {
      if (err) {
        return reject(err);
      }
      resolve(true);
    });
  });
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
  console.log('ensure: ', filePath);
  try {
    // Fast path: already writable
    await fs.access(filePath, fs.constants.W_OK);
    return 'writable';
  } catch {
    // Not writable — attempt to fix
    if (os.platform() === 'win32') {
      await removeReadOnlyWindows(filePath);
    } else {
      await fs.chmod(filePath, 0o666);
    }

    // Verify
    await fs.access(filePath, fs.constants.W_OK);
    return 'changed-to-writable';
  }
}
