import path from 'node:path';
import process from 'node:process';

export function sameCatalogPath(a, b, platform = process.platform) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const flavor = platform === 'win32' ? path.win32 : path.posix;
  const normalize = (file) => {
    const resolved = flavor.resolve(file);
    return platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalize(a) === normalize(b);
}

// column and folder are SQL expressions supplied only by application query builders.
export function albumDirectoryRanges(column, folder, platform = process.platform) {
  if (platform !== 'win32') {
    const directory = `rtrim(${folder}, '/')`;
    return `(${column} COLLATE BINARY >= ${directory} || '/' AND ${column} COLLATE BINARY < ${directory} || '0')`;
  }
  const directory = `rtrim(replace(${folder}, char(92), '/'), '/')`;
  const windows = `replace(${directory}, '/', char(92))`;
  return `((${column} COLLATE NOCASE >= ${directory} || '/' AND ${column} COLLATE NOCASE < ${directory} || '0')
    OR (${column} COLLATE NOCASE >= ${windows} || char(92) AND ${column} COLLATE NOCASE < ${windows} || ']'))`;
}

export function albumTracksQuery(folders, platform = process.platform) {
  const ranges = new Map();
  for (let folder of Array.isArray(folders) ? folders : [folders]) {
    if (typeof folder !== 'string' || !folder) continue;
    if (platform === 'win32') folder = folder.replaceAll('\\', '/');
    folder = folder.replace(/\/+$/, '');
    ranges.set(folder + '/', folder + '0');
    if (platform === 'win32') {
      const windows = folder.replaceAll('/', '\\');
      ranges.set(windows + '\\', windows + ']');
    }
  }
  const collation = platform === 'win32' ? 'NOCASE' : 'BINARY';
  return {
    sql:
      'SELECT * FROM "audio-tracks" WHERE ' +
      ([...ranges]
        .map(() => `(audiotrack COLLATE ${collation} >= ? AND audiotrack COLLATE ${collation} < ?)`)
        .join(' OR ') || '0'),
    params: [...ranges].flat()
  };
}

export function trackCoverParents(directory, roots, platform = process.platform) {
  const flavor = platform === 'win32' ? path.win32 : path.posix;
  const resolved = flavor.resolve(directory);
  const candidates = roots
    .map((root) => {
      const base = flavor.resolve(root),
        relative = flavor.relative(base, resolved);
      return { base, relative };
    })
    .filter(
      ({ relative }) =>
        relative &&
        relative !== '..' &&
        !relative.startsWith('..' + flavor.sep) &&
        !flavor.isAbsolute(relative)
    )
    .sort((a, b) => b.base.length - a.base.length);
  if (!candidates.length) return [];
  const { base, relative } = candidates[0];
  const segments = relative.split(flavor.sep);
  const parents = [];
  // Preserve album-folder preference, then try actual intermediate parents nearest first.
  if (segments.length > 1) parents.push(flavor.join(base, segments[0]));
  for (let length = segments.length - 1; length > 1; length--)
    parents.push(flavor.join(base, ...segments.slice(0, length)));
  return parents.map((folder) => (platform === 'win32' ? folder.replaceAll('\\', '/') : folder));
}
