import fs from 'node:fs';
import path from 'node:path';

export function mpvExecutable({ development, resources, root = process.cwd() }) {
  if (process.env.MPV_EXECUTABLE) return path.resolve(process.env.MPV_EXECUTABLE);
  return development
    ? path.join(root, 'vendor/mpv/windows-x64/mpv.exe')
    : path.join(resources, 'mpv/mpv.exe');
}
export function mpvRuntimeStatus(executable) {
  return { available: fs.existsSync(executable), engine: 'mpv' };
}
