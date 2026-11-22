import { useState, useEffect, useRef } from 'react';
import { useAudioPlayer } from '../mainAudioContext';
import ScheduleForm from './ScheduleForm';
import NativeDragDropFolderInput from './NativeDragDropFolderInput';
import MainPreferences from './MainPreferences';
import PlaybackPreferences from './PlaybackPreferences';
import '../style/Update.css';

const sections = [
  ['setup', 'Setup / Modify', 'Choose the music folders included in your library.'],
  ['schedule', 'Scheduling', 'Choose when automatic library updates run.'],
  ['playback', 'Playback', 'Choose the audio playback engine.'],
  ['preferences', 'Theme Preferences', 'Choose the colors used throughout the app.']
];

const Update = () => {
  const { state, dispatch } = useAudioPlayer();
  const [rootDirs, setRootDirs] = useState(null);
  const [rootsError, setRootsError] = useState('');
  const [reload, setReload] = useState(0);
  const sectionRefs = useRef({});

  useEffect(() => {
    let current = true;
    setRootsError('');
    window.ipcApi
      .getRoots()
      .then((roots) => {
        if (!Array.isArray(roots)) throw new Error('Invalid folder response');
        if (current) setRootDirs(roots);
      })
      .catch(() => {
        if (current)
          setRootsError('Could not load your music folders. Try again before editing them.');
      });
    return () => {
      current = false;
    };
  }, [reload]);

  useEffect(() => {
    if (state.setup && state.setup !== 'setup') {
      sectionRefs.current[state.setup]?.scrollIntoView({ block: 'start' });
    } else {
      sectionRefs.current.setup?.parentElement?.scrollTo({ top: 0 });
    }
  }, [state.setup]);

  return (
    <main
      className={`update-container settings-page ${state.mainTheme}`}
      aria-labelledby="settings-title"
    >
      <header className="settings-header">
        <h1 id="settings-title">Settings</h1>
        <p>Music folders, update schedules, playback, and appearance.</p>
      </header>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {sections.map(([id, title]) => (
            <button
              key={id}
              type="button"
              aria-current={(state.setup || 'setup') === id ? 'location' : undefined}
              onClick={() => {
                dispatch({ type: 'config-options', setup: id });
                sectionRefs.current[id]?.scrollIntoView({ block: 'start' });
              }}
            >
              {title}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {sections.map(([id, title, description]) => (
            <section
              key={id}
              id={`settings-${id}`}
              className="settings-card"
              aria-labelledby={`settings-${id}-title`}
              ref={(element) => {
                sectionRefs.current[id] = element;
              }}
            >
              <header>
                <h2 id={`settings-${id}-title`}>{title}</h2>
                <p>{description}</p>
              </header>
              {id === 'setup' &&
                (rootsError ? (
                  <div className="settings-error" role="alert">
                    <p>{rootsError}</p>
                    <button type="button" onClick={() => setReload((value) => value + 1)}>
                      Retry loading folders
                    </button>
                  </div>
                ) : rootDirs === null ? (
                  <p role="status">Loading music folders…</p>
                ) : (
                  <NativeDragDropFolderInput rootDirs={rootDirs} setRootDirs={setRootDirs} />
                ))}
              {id === 'schedule' && <ScheduleForm />}
              {id === 'playback' && <PlaybackPreferences />}
              {id === 'preferences' && <MainPreferences />}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
};

export default Update;
