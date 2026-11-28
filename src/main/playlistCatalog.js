import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { availableMusicTracks } from './musicAvailability.js';

const windowsPath = (file) => /^[a-z]:/i.test(file) || /^(?:\\\\|\/\/)/.test(file);

export function parsePlaylist(text, filename) {
  return text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => (windowsPath(filename) || windowsPath(line.trim()) ? line.trim() : line))
    .filter((line) => line.trim() && !line.trimStart().startsWith('#'))
    .map((line) => {
      const flavor = windowsPath(line) || windowsPath(filename) ? path.win32 : path.posix;
      const file = flavor.resolve(flavor.dirname(filename), line);
      return flavor === path.win32 ? file.replaceAll('\\', '/') : file;
    });
}

export function serializePlaylist(tracks, platform = process.platform) {
  return tracks
    .map(({ audiotrack }) => {
      if (typeof audiotrack !== 'string' || /[\r\n]/.test(audiotrack))
        throw new Error('This filename cannot be represented as an M3U entry.');
      return platform === 'win32' ? audiotrack.replaceAll('/', '\\') : audiotrack;
    })
    .join('\n');
}

export async function loadCatalogPlaylist(db, filename) {
  const entries = parsePlaylist(await fs.readFile(filename, 'utf8'), filename);
  if (!entries.length) return availableMusicTracks([]);
  // Keep the existing batched lookup rather than querying once for every track.
  const placeholders = entries.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT track_id, like, audiotrack, performers, title, album
    FROM "audio-tracks" WHERE audiotrack IN (${placeholders})`
    )
    .all(...entries);
  const byPath = new Map(rows.map((track) => [track.audiotrack, track]));
  const missing = entries
    .filter((entry) => !byPath.has(entry))
    .map((entry) => ({
      path: entry,
      reason: 'not-in-catalog',
      message:
        'This playlist entry is not in the music catalog. Make its folder available and scan it before loading again.'
    }));
  return availableMusicTracks(entries.map((entry) => byPath.get(entry)).filter(Boolean), {
    missing,
    requestedCount: entries.length
  });
}
