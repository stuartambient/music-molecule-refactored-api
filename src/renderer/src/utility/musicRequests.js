export function availabilityNotice(result, title, browsing = false) {
  const skipped = result.unavailableCount + result.missingCatalogCount;
  if (!skipped && result.tracks.length) return null;
  const tracks = (count) => `${count} ${count === 1 ? 'track' : 'tracks'}`;
  const parts = [`${tracks(result.tracks.length)} available.`];
  if (result.unavailableCount)
    parts.push(
      `${result.unavailableCount} unavailable ${result.unavailableCount === 1 ? 'track' : 'tracks'}${browsing ? '.' : ' skipped.'}`
    );
  if (result.missingCatalogCount)
    parts.push(
      `${result.missingCatalogCount} playlist ${result.missingCatalogCount === 1 ? 'entry is' : 'entries are'} not in the catalog. Scan those files before loading again.`
    );
  if (!result.requestedCount) parts.push('No tracks were found.');
  if (browsing) parts.push('Catalog tracks remain visible.');
  else if (!result.tracks.length) parts.push('Your current Playlist was kept.');
  parts.push(
    'Catalog entries have been kept. Restore the files or reconnect their drive, then try again.'
  );
  return { title, message: parts.join(' '), examples: result.examples, entryCount: skipped };
}

export async function requestMusicTracks(
  channel,
  args,
  dispatch,
  title,
  isCurrent = () => true,
  browsing = false
) {
  const id = crypto.randomUUID();
  dispatch({
    type: 'music-notice',
    notice: { id, title, message: 'Checking music files…', busy: true }
  });
  try {
    const operations = {
      'prepare-music-tracks': (...values) => window.ipcApi.prepareMusicTracks(...values),
      'open-playlist': () => window.ipcApi.openPlaylist()
    };
    if (!Object.hasOwn(operations, channel)) throw new Error('Unknown music request.');
    const result = await operations[channel](...args);
    if (!isCurrent()) {
      dispatch({ type: 'music-notice-result', id, notice: null });
      return null;
    }
    if (result === 'action cancelled') {
      dispatch({ type: 'music-notice-result', id, notice: null });
      return null;
    }
    dispatch({
      type: 'music-notice-result',
      id,
      notice: availabilityNotice(result, title, browsing)
    });
    return browsing ? result.catalogTracks : result.tracks;
  } catch (error) {
    dispatch({
      type: 'music-notice-result',
      id,
      notice: isCurrent()
        ? {
            title,
            message:
              'Music files could not be loaded. Your current Playlist was kept. Check that the drive and folders are available, then try again.',
            examples: [{ path: '', message: error.message }]
          }
        : null
    });
    return null;
  }
}
