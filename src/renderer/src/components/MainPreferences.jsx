import { useState, useEffect } from 'react';
import { useAudioPlayer } from '../mainAudioContext';
import { mainThemes, normalizeMainTheme } from '../../../shared/themePreferences';
import '../style/MainPreferences.css';

const MainPreferences = () => {
  const { state, dispatch } = useAudioPlayer();
  const [selectedTheme, setSelectedTheme] = useState(normalizeMainTheme(state.mainTheme));
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelectedTheme(normalizeMainTheme(state.mainTheme));
  }, [state.mainTheme]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      if (!(await window.ipcApi.savePreferences({ mainTheme: selectedTheme })))
        throw new Error('Save failed');
      dispatch({ type: 'set-main-theme', mainTheme: selectedTheme });
      setSaved(true);
    } catch {
      setError('Could not save the theme. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="themes-form"
      onSubmit={handleSubmit}
      aria-label="Theme preferences"
      aria-busy={saving}
    >
      <fieldset disabled={saving}>
        <legend>Choose a theme</legend>
        <div className="theme-options">
          {mainThemes.map((theme) => (
            <label
              key={theme}
              className={`theme-option${selectedTheme === theme ? ' is-selected' : ''}`}
            >
              <input
                type="radio"
                name="theme"
                value={theme}
                checked={selectedTheme === theme}
                onChange={(event) => {
                  setSelectedTheme(event.target.value);
                  setSaved(false);
                  setError('');
                }}
              />
              <span className={`theme-swatch ${theme}`} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>{theme === 'basic' ? 'Basic' : theme.replace('theme-', 'Theme ')}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="settings-help">
        The tag editor follows this theme unless you select a Light or Dark override in its toolbar.
      </p>
      <div className="settings-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Applying…' : 'Apply theme'}
        </button>
      </div>
      {saved && (
        <p className="settings-result" role="status">
          Theme applied.
        </p>
      )}
      {error && (
        <p className="settings-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
};

export default MainPreferences;
