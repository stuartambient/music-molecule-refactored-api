import { useEffect, useRef } from 'react';

export default function useGaplessPreference(state, dispatch) {
  const revision = state.gaplessPreferenceRevision || 0;
  const latestRevision = useRef(revision);
  latestRevision.current = revision;

  useEffect(() => {
    let current = true;
    const request = latestRevision.current;
    Promise.resolve(window.ipcApi.getPreferences?.())
      .then((preferences) => {
        if (current && request === latestRevision.current)
          dispatch({
            type: 'hydrate-playlist-gapless',
            enabled: preferences?.playlistGapless === true
          });
      })
      .catch((error) => console.warn('Could not restore Gapless preference:', error.message));
    return () => {
      current = false;
    };
  }, [dispatch]);

  useEffect(() => {
    if (!revision) return;
    let current = true;
    Promise.resolve(window.ipcApi.savePreferences?.({ playlistGapless: state.playlistGapless }))
      .then((saved) => {
        if (!saved) throw new Error('Save failed');
      })
      .catch(() => {
        if (current && latestRevision.current === revision)
          dispatch({
            type: 'music-notice',
            notice: {
              title: 'Gapless setting',
              message:
                'The setting applies for this session, but could not be saved for next time. Please try again.'
            }
          });
      });
    return () => {
      current = false;
    };
  }, [revision, state.playlistGapless, dispatch]);
}
