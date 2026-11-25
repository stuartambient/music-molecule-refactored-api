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
  const res = valid.length ? await save(valid) : { success: true, files: [] };
  if (!res?.success) {
    throw new Error(
      `Database metadata refresh failed. ${res?.message || 'No save confirmation received.'} Run Update Meta to retry.`
    );
  }
  return { res, failed };
}

export async function updateChangedMetadata(tracks, { stat, parse, save }) {
  const changed = [];
  let failed = 0;
  const failures = [];
  for (const track of tracks) {
    try {
      const stats = await stat(track.audiotrack);
      if (stats.mtimeMs > track.modified) changed.push({ ...track, id: track.audiotrack });
    } catch (error) {
      failed++;
      if (failures.length < 10)
        failures.push({ id: track.audiotrack, error: error.message || String(error) });
    }
  }
  const result = await refreshMetadata(changed, { parse, save });
  failed += result.failed.length;
  failures.push(...result.failed.slice(0, 10 - failures.length));
  const modified = result.res.files.length;
  return { modified, failed, failures, nochange: modified === 0 && failed === 0 };
}
