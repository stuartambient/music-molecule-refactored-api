import { createContext, useContext } from 'react';

export const EditorThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(EditorThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};
