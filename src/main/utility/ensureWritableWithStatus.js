import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function hasReadOnlyAttribute(filePath) {
  try {
    const { stdout } = await execFileAsync('attrib', [filePath]);

    // Example output:
    // "R    C:\\Music\\track.flac"
    // "RA   C:\\Music\\track.flac"

    const match = stdout.match(/^([A-Z]+)\s+/);
    if (!match) return false;

    return match[1].includes('R');
  } catch {
    // If attrib fails (missing file, etc.), assume not read-only
    return false;
  }
}

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
  let hadReadOnly = false;

  try {
    await fs.access(filePath, fs.constants.W_OK);
    return { status: 'writable', hadReadOnly: false };
  } catch (err) {
    // Check attribute explicitly (Windows only)

    if (err.code === 'ENOENT') {
      return {
        status: 'missing',
        hadReadOnly: false,
        error: err
      };
    }
    if (os.platform() === 'win32') {
      hadReadOnly = await hasReadOnlyAttribute(filePath);

      if (hadReadOnly) {
        await removeReadOnlyWindows(filePath);
      }
    } else {
      await fs.chmod(filePath, 0o666);
    }

    try {
      await fs.access(filePath, fs.constants.W_OK);
      return {
        status: hadReadOnly ? 'changed-to-writable' : 'writable-after-retry',
        hadReadOnly
      };
    } catch (err) {
      return {
        status: 'unwritable',
        hadReadOnly,
        error: err
      };
    }
  }
}
