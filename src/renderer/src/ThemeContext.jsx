import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  mainThemes,
  normalizeMainTheme,
  normalizeEditorTheme
} from '../../shared/themePreferences';

import { EditorThemeContext } from './editorThemeContext';

export const ThemeProvider = ({ children }) => {
  const [preferences, setPreferences] = useState(() => ({
    mainTheme: normalizeMainTheme(window.initialMainTheme),
    editorTheme: normalizeEditorTheme(window.initialEditorTheme)
  }));
  const [themeError, setThemeError] = useState('');
  const [theme, setTheme] = useState('dark');
  const revision = useRef(0);

  useEffect(() => {
    let current = true;
    const apply = (next) => {
      revision.current++;
      if (current)
        setPreferences({
          mainTheme: normalizeMainTheme(next.mainTheme),
          editorTheme: normalizeEditorTheme(next.editorTheme)
        });
    };
    const unsubscribe = window.tagEditApi.on('theme-preferences-updated', apply);
    const request = revision.current;
    window.tagEditApi
      .getPreferences()
      .then((next) => {
        if (current && request === revision.current) apply(next);
      })
      .catch(() => {
        if (current)
          setThemeError('Could not refresh the theme. Using the window’s initial theme.');
      });
    return () => {
      current = false;
      unsubscribe();
    };
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.remove(...mainThemes, 'light', 'dark');
    root.classList.add(preferences.mainTheme);
    root.dataset.editorTheme = preferences.editorTheme;
    root.dataset.themeSurface = 'editor';
    setTheme(
      getComputedStyle(root).getPropertyValue('--ui-color-scheme').trim() === 'light'
        ? 'light'
        : 'dark'
    );
    return () => {
      delete root.dataset.editorTheme;
      delete root.dataset.themeSurface;
    };
  }, [preferences]);

  const setEditorTheme = async (value) => {
    const editorTheme = normalizeEditorTheme(value);
    const previous = preferences;
    const request = ++revision.current;
    setThemeError('');
    setPreferences((current) => ({ ...current, editorTheme }));
    try {
      if (!(await window.tagEditApi.savePreferences({ editorTheme })))
        throw new Error('Save failed');
    } catch {
      if (request === revision.current) {
        setPreferences(previous);
        setThemeError('Could not save the editor theme. Please try again.');
      }
    }
  };

  return (
    <EditorThemeContext.Provider
      value={{ theme, editorTheme: preferences.editorTheme, setEditorTheme, themeError }}
    >
      {children}
    </EditorThemeContext.Provider>
  );
};
