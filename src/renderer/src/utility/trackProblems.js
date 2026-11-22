const engine = (state) => state.playbackBackend || 'builtin';
const key = (track, backend) => JSON.stringify([backend, track?.audiotrack]);

export function getTrackProblem(state, track) {
  if (!track?.audiotrack) return null;
  return (
    state.trackProblems?.[key(track, 'availability')] ||
    state.trackProblems?.[key(track, engine(state))] ||
    null
  );
}

export function recordTrackProblem(state, error) {
  if (!state.playbackTrack?.audiotrack) return state.trackProblems || {};
  const backend = error?.available === false ? 'availability' : engine(state);
  return {
    ...state.trackProblems,
    [key(state.playbackTrack, backend)]: {
      message: error?.message || 'The player could not start this track.',
      backend
    }
  };
}

export function clearTrackProblem(state) {
  const problems = state.trackProblems || {};
  const keys = [key(state.playbackTrack, 'availability'), key(state.playbackTrack, engine(state))];
  if (!keys.some((key) => Object.hasOwn(problems, key))) return problems;
  const next = { ...problems };
  for (const key of keys) delete next[key];
  return next;
}
