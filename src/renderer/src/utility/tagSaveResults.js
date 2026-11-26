// A save result may arrive after the user has made more edits in the grid.
export function reconcileTagSaveResult(undos, submitted, result) {
  const confirmed = new Set((result.passed || []).map((file) => file.track_id));
  const remaining = undos.filter((edit) => !(submitted.has(edit) && confirmed.has(edit.rowId)));
  const pending = new Map();
  for (const edit of remaining) {
    if (!pending.has(edit.rowId)) pending.set(edit.rowId, {});
    pending.get(edit.rowId)[edit.field] = edit.newValue;
  }
  const rows = (result.res?.files || []).map((row) => ({ ...row, ...pending.get(row.track_id) }));
  return { remaining, rows };
}
