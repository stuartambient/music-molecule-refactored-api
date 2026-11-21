export function selectedTrackIndex(state, list, queue) {
  const selection = state.listSelections?.[list];
  if (!selection?.trackId) return -1;
  // Keep duplicate playlist occurrences distinct, but tolerate shifted rows.
  if (queue[selection.index]?.track_id === selection.trackId) return selection.index;
  return queue.findIndex((track) => track.track_id === selection.trackId);
}

export function withoutListSelection(state, list) {
  const selections = { ...state.listSelections };
  delete selections[list];
  return selections;
}
