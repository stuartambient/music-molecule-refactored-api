import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function executableFile(file, platform) {
  try {
    if (!fs.statSync(file).isFile()) return false;
    fs.accessSync(file, platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function mpvExecutable({
  development,
  resources,
  root = process.cwd(),
  platform = process.platform,
  arch = process.arch,
  env = process.env,
  canExecute = (file) => executableFile(file, platform)
}) {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const fromPath = (name) =>
    (env.PATH || '')
      .split(platform === 'win32' ? ';' : ':')
      .filter((folder) => paths.isAbsolute(folder))
      .map((folder) => paths.join(folder, name))
      .find(canExecute);
  if (env.MPV_EXECUTABLE) {
    const selected = env.MPV_EXECUTABLE;
    return !selected.includes('/') && !selected.includes('\\')
      ? fromPath(selected) || paths.resolve(root, selected)
      : paths.resolve(root, selected);
  }
  if (platform === 'win32')
    return development
      ? paths.join(root, 'vendor/mpv/windows-x64/mpv.exe')
      : paths.join(resources, 'mpv/mpv.exe');
  const bundled = development
    ? paths.join(root, `vendor/mpv/${platform}-${arch}/mpv`)
    : paths.join(resources, 'mpv/mpv');
  return canExecute(bundled) ? bundled : fromPath('mpv') || 'mpv';
}

export function mpvRuntimeStatus(executable) {
  return { available: executableFile(executable, process.platform), engine: 'mpv' };
}
