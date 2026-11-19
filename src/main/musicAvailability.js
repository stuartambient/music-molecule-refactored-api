import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

function unavailable(file, reason, message) {
  return { available: false, path: file, reason, message };
}

// Cache only within one operation: reconnecting a drive must work on the next attempt.
export function createMusicAvailabilityCheck() {
  const folders = new Map();
  return async (file) => {
    if (typeof file !== 'string' || !file.trim())
      return unavailable('', 'invalid-path', 'This track has no usable file location.');
    const folder = path.dirname(file);
    if (!folders.has(folder)) {
      folders.set(
        folder,
        fs.stat(folder).then(
          (stat) => stat.isDirectory(),
          () => false
        )
      );
    }
    if (!(await folders.get(folder)))
      return unavailable(
        file,
        'folder-unavailable',
        'The music folder is unavailable. Reconnect its drive or restore the folder, then try again.'
      );
    try {
      const stat = await fs.stat(file);
      if (!stat.isFile())
        return unavailable(file, 'not-file', 'This location is not an audio file.');
      await fs.access(file, constants.R_OK);
      return { available: true };
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR')
        return unavailable(
          file,
          'file-missing',
          'This track is missing from its music folder. Restore the file, then try again.'
        );
      return unavailable(
        file,
        'unreadable',
        'This track cannot be read. Check its drive and file permissions, then try again.'
      );
    }
  };
}

export async function availableMusicTracks(
  tracks,
  { missing = [], requestedCount = tracks.length + missing.length } = {}
) {
  const check = createMusicAvailabilityCheck();
  const results = new Array(tracks.length);
  let next = 0;
  // Bound filesystem work; preserve the input order, including repeated M3U entries.
  await Promise.all(
    Array.from({ length: Math.min(16, tracks.length) }, async () => {
      while (next < tracks.length) {
        const index = next++;
        results[index] = await check(tracks[index].audiotrack);
      }
    })
  );
  const unavailable = results.filter((result) => !result.available);
  return {
    tracks: tracks.filter((_, index) => results[index].available),
    requestedCount,
    unavailableCount: unavailable.length,
    missingCatalogCount: missing.length,
    examples: [...unavailable.slice(0, 5), ...missing.slice(0, 5)].slice(0, 5)
  };
}
