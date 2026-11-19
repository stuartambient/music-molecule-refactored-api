import fs from 'node:fs/promises';
import path from 'node:path';
import { availableMusicTracks } from './musicAvailability.js';

export function parsePlaylist(text, filename) {
  return text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const paths =
        path.win32.isAbsolute(line) || path.win32.isAbsolute(filename) ? path.win32 : path;
      return (
        paths.isAbsolute(line)
          ? paths.normalize(line)
          : paths.resolve(paths.dirname(filename), line)
      ).replaceAll('\\', '/');
    });
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
