export const mainThemes = [
  'basic',
  'theme-1',
  'theme-2',
  'theme-3',
  'theme-4',
  'theme-5',
  'theme-6'
];
export const editorThemes = ['follow', 'light', 'dark'];
export const normalizeMainTheme = (value) => (mainThemes.includes(value) ? value : 'basic');
export const normalizeEditorTheme = (value) => (editorThemes.includes(value) ? value : 'follow');
