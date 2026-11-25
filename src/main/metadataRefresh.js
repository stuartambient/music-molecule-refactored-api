// Keep failed reads out of the write batch so their stored timestamps remain retryable.
export async function refreshMetadata(files, { parse, save }) {
  const parsed = await parse(files);
  const failed = parsed
    .filter((file) => file.error)
    .map((file) => ({
      track_id: file.track_id,
      id: file.audiotrack,
      error: file.error
    }));
  const valid = parsed.filter((file) => !file.error);
  let res;
  try {
    res = valid.length ? await save(valid) : { success: true, files: [] };
    if (!res?.success) throw new Error(res?.message || 'No save confirmation received.');
  } catch (cause) {
    const error = new Error(
      `Database metadata refresh failed. ${cause.message || String(cause)} Run Catalog report to retry.`
    );
    error.refreshFailed = failed;
    error.unsaved = valid;
    throw error;
  }
  return { res, failed };
}

const isMissing = (error) =>
  ['ENOENT', 'ENOTDIR'].includes(error.code) ||
  /^(?:Error: )?(?:ENOENT|ENOTDIR):/.test(error.error || '');

export async function updateChangedMetadata(tracks, { stat, parse, save }) {
  const changed = [];
  const details = { missing: [], bad: [], modified: [] };
  const addFailure = (file) => details[isMissing(file) ? 'missing' : 'bad'].push(file);
  const summary = () => {
    const failed = details.missing.length + details.bad.length;
    return {
      modified: details.modified.length,
      failed,
      failures: [...details.missing, ...details.bad].slice(0, 10),
      nochange: !details.modified.length && !failed,
      details
    };
  };
  for (const track of tracks) {
    try {
      const stats = await stat(track.audiotrack);
      if (stats.mtimeMs > track.modified) changed.push({ ...track, id: track.audiotrack });
      else if (track.error) {
        // Unchanged files are not reread, but their saved Track Errors still belong in the report.
        details.bad.push({
          track_id: track.track_id,
          id: track.audiotrack,
          error: track.error,
          source: 'catalog'
        });
      }
    } catch (error) {
      addFailure({
        track_id: track.track_id,
        id: track.audiotrack,
        code: error.code,
        error: error.message || String(error)
      });
    }
  }
  try {
    const previous = new Map(changed.map((file) => [file.track_id, file]));
    const result = await refreshMetadata(changed, { parse, save });
    result.failed.forEach(addFailure);
    const paths = new Map(changed.map((file) => [file.track_id, file.id]));
    details.modified = result.res.files.map((file) => {
      const before = previous.get(file.track_id);
      return {
        track_id: file.track_id,
        id: file.audiotrack || paths.get(file.track_id),
        previousModified: before?.modified,
        modified: file.modified,
        reason: 'Refreshed because the file modification time is newer than the catalog'
      };
    });
    return summary();
  } catch (error) {
    (error.refreshFailed || []).forEach(addFailure);
    for (const file of error.unsaved || changed) {
      details.bad.push({
        track_id: file.track_id,
        id: file.audiotrack || file.id,
        error: error.message
      });
    }
    error.report = { ...summary(), error: error.message, nochange: false };
    throw error;
  }
}
