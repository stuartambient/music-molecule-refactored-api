export function trackNumber(value) {
  if (typeof value === 'string') {
    const match = /^\s*(\d+)(?:\s*\/\s*\d+)?\s*$/.exec(value);
    value = match ? Number(match[1]) : null;
  }
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function sortAlbumTracks(tracks) {
  return [...tracks].sort((a, b) => {
    const disc = (trackNumber(a.disc) ?? 1) - (trackNumber(b.disc) ?? 1);
    if (disc) return disc;
    const first = trackNumber(a.track) ?? Infinity;
    const second = trackNumber(b.track) ?? Infinity;
    if (first !== second) return first - second;
    return String(a.audiotrack || a.title || '').localeCompare(
      String(b.audiotrack || b.title || ''),
      undefined,
      { numeric: true, sensitivity: 'base' }
    );
  });
}
