import { sameCatalogPath } from './catalogPaths.js';
import { createTagSaveJournal, listTagSaveJobs, pendingTagSaveSummary } from './tagSaveJournal.js';

const message = (error) => error?.message || String(error);
export async function runTagSaveBatch({
  db,
  edits = [],
  retry = false,
  write,
  expect,
  verify,
  parse,
  save,
  inspect
}) {
  const journal = createTagSaveJournal(db);
  const jobs = retry ? listTagSaveJobs(db) : edits.filter(Boolean);
  const outcomes = [],
    rows = [];
  const lookup = db.prepare('SELECT audiotrack FROM "audio-tracks" WHERE track_id=?');
  for (const edit of jobs) {
    const result = {
      track_id: edit.track_id,
      id: edit.id,
      write: { status: retry ? 'not_repeated' : 'not_started' },
      verification: { status: 'unavailable' },
      catalog: { status: 'not_started' }
    };
    try {
      if (!sameCatalogPath(lookup.get(edit.track_id)?.audiotrack, edit.id))
        throw new Error('This file no longer matches its catalog entry. No file was changed.');
      const expected = retry ? edit.expected : await expect(edit);
      if (!retry) {
        // This committed record must exist before the first possible audio-file write.
        journal.begin(edit, expected);
        try {
          const written = await write({ ...edit, updates: { ...edit.updates } });
          const errors = written.errors || [];
          result.write = errors.length
            ? { status: 'failed', error: errors.map((file) => file.error).join('; ') }
            : { status: 'saved' };
        } catch (error) {
          result.write = { status: 'failed', error: message(error) };
        }
      }
      const snapshot = inspect ? await inspect(edit.id) : null;
      try {
        result.verification = await verify(edit, expected);
      } catch (error) {
        result.verification = { status: 'unavailable', error: message(error) };
      }
      // Reconcile actual on-disk tags even after a partial or failed file write.
      try {
        const parsed = (await parse([edit]))[0];
        if (!parsed || parsed.error)
          throw new Error(parsed?.error || 'No metadata returned for this file.');
        if (inspect) {
          const current = await inspect(edit.id);
          if (snapshot.mtimeMs !== current.mtimeMs || snapshot.size !== current.size) {
            result.verification = {
              status: 'unavailable',
              error:
                'File changed while its tags were being checked. Recheck it before confirming this save.'
            };
            throw new Error(result.verification.error);
          }
        }
        const saved = await save([parsed]);
        if (!saved?.success || !saved.files?.[0])
          throw new Error(saved?.message || 'Catalog update was not confirmed.');
        rows.push(saved.files[0]);
        result.catalog = { status: 'updated' };
      } catch (error) {
        result.catalog = { status: 'failed', error: message(error) };
      }
      const verified = result.verification.status === 'confirmed';
      result.success =
        verified && result.catalog.status === 'updated' && result.write.status !== 'failed';
      result.outcome = result.success
        ? 'Saved and catalog updated'
        : !verified
          ? result.verification.status === 'mismatch' || result.write.status === 'failed'
            ? 'Tag write failed or incomplete'
            : 'Could not verify'
          : result.write.status === 'failed'
            ? 'Tag write reported an error'
            : 'Tags saved; catalog refresh failed';
      result.error = [result.write.error, result.verification.error, result.catalog.error]
        .filter(Boolean)
        .join('; ');
      if (result.success) journal.finish(edit.track_id);
      else journal.failed(edit.track_id, result.error);
    } catch (error) {
      result.success = false;
      result.outcome =
        result.write.status === 'not_started'
          ? 'Tag write not started'
          : result.catalog.status === 'updated'
            ? 'Saved; recovery record needs recheck'
            : 'Could not verify';
      result.error = message(error);
      // A journal failure must never be mistaken for a successful save.
    }
    outcomes.push(result);
  }
  const passed = outcomes
    .filter((file) => file.success)
    .map((file) => ({ track_id: file.track_id, track: file.id }));
  const failed = outcomes
    .filter((file) => !file.success)
    .map((file) => ({ track_id: file.track_id, id: file.id, error: file.error }));
  return {
    recovery: retry,
    status: failed.length ? (passed.length ? 'partial_status' : 'failed') : 'success',
    passed,
    failed,
    outcomes,
    res: { success: failed.length === 0, files: rows },
    pending: pendingTagSaveSummary(db)
  };
}
