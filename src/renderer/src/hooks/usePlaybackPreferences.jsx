import { useEffect, useRef } from 'react';

const gaplessValue = (value) => value === true;
const backendValue = (value) => (value === 'mpv' ? 'mpv' : 'builtin');

function useSavedPreference({ key, value, revision, hydrate, field, normalize, title }, dispatch) {
  const latestRevision = useRef(revision);
  latestRevision.current = revision;
  useEffect(() => {
    let current = true;
    const request = latestRevision.current;
    Promise.resolve(window.ipcApi.getPreferences?.())
      .then((preferences) => {
        if (current && request === latestRevision.current)
          dispatch({ type: hydrate, [field]: normalize(preferences?.[key]) });
      })
      .catch((error) => console.warn(`Could not restore ${title}:`, error.message));
    return () => {
      current = false;
    };
  }, [key, hydrate, field, normalize, title, dispatch]);
  useEffect(() => {
    if (!revision) return;
    let current = true;
    Promise.resolve(window.ipcApi.savePreferences?.({ [key]: value }))
      .then((saved) => {
        if (!saved) throw new Error('Save failed');
      })
      .catch(() => {
        if (current && latestRevision.current === revision)
          dispatch({
            type: 'music-notice',
            notice: {
              title,
              message:
                'The setting applies for this session, but could not be saved for next time. Please try again.'
            }
          });
      });
    return () => {
      current = false;
    };
  }, [key, value, revision, title, dispatch]);
}

export default function usePlaybackPreferences(state, dispatch) {
  useSavedPreference(
    {
      key: 'playlistGapless',
      value: state.playlistGapless,
      revision: state.gaplessPreferenceRevision || 0,
      hydrate: 'hydrate-playlist-gapless',
      field: 'enabled',
      normalize: gaplessValue,
      title: 'Gapless setting'
    },
    dispatch
  );
  useSavedPreference(
    {
      key: 'playbackBackend',
      value: state.playbackBackend || 'builtin',
      revision: state.backendPreferenceRevision || 0,
      hydrate: 'hydrate-playback-backend',
      field: 'backend',
      normalize: backendValue,
      title: 'Playback engine setting'
    },
    dispatch
  );
}
