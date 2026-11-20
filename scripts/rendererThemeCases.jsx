import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../src/renderer/src/ThemeContext';
import { useTheme } from '../src/renderer/src/editorThemeContext';
import { AudioProvider } from '../src/renderer/src/components/table/AudioProvider';
import AGGrid from '../src/renderer/src/components/table/AGGrid';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const style = document.createElement('style');
style.textContent = window.themeCss;
document.head.append(style);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const rows = Array.from({ length: 8 }, (_, index) => ({
  track_id: String(index),
  audiotrack: `fixture-${index}.flac`,
  title: ['A Quiet Morning', 'Under the Pines', 'Driftwood', 'Small Hours'][index % 4],
  album: 'Collected Sessions',
  performers: 'The Example Quartet',
  year: 2026,
  genres: 'Jazz',
  codecs: 'FLAC',
  duration: 213,
  like: index === 2 ? 1 : 0
}));
let preferences, listeners, saves, context;
function fixture(mainTheme = 'basic', editorTheme) {
  preferences = { mainTheme, editorTheme };
  listeners = new Map();
  saves = [];
  window.initialMainTheme = mainTheme;
  window.initialEditorTheme = editorTheme;
  window.tagEditApi = {
    on(channel, callback) {
      if (!listeners.has(channel)) listeners.set(channel, new Set());
      listeners.get(channel).add(callback);
      return () => listeners.get(channel)?.delete(callback);
    },
    getPreferences: async () => preferences,
    getPreferencesSync: async () => preferences,
    async savePreferences(patch) {
      saves.push(patch);
      preferences = { ...preferences, ...patch };
      emit('theme-preferences-updated', preferences);
      return true;
    },
    childReady() {
      queueMicrotask(() => emit('send-to-child', { results: rows }));
    },
    showContextMenu() {}
  };
}
function emit(channel, data) {
  for (const callback of listeners.get(channel) || []) callback(data);
}
function Probe() {
  context = useTheme();
  return null;
}
function mount() {
  const element = document.createElement('div');
  element.id = 'metadata-editing';
  document.body.append(element);
  const root = createRoot(element);
  return {
    async render(grid = false) {
      await act(async () => {
        root.render(
          <React.StrictMode>
            <ThemeProvider>
              <Probe />
              {grid && (
                <AudioProvider>
                  <AGGrid />
                </AudioProvider>
              )}
            </ThemeProvider>
          </React.StrictMode>
        );
        await frame();
      });
    },
    async dispose() {
      await act(async () => {
        root.unmount();
      });
      element.remove();
    }
  };
}
function color(role) {
  const element = document.createElement('span');
  element.style.color = `var(--ui-${role})`;
  document.body.append(element);
  const result = getComputedStyle(element).color;
  element.remove();
  return result;
}
function luminance(value) {
  const rgb = value
    .match(/[\d.]+/g)
    .slice(0, 3)
    .map(Number)
    .map((n) => {
      n /= 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a, b) {
  const values = [luminance(color(a)), luminance(color(b))].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

window.themeTests = (async () => {
  const results = [];
  for (const mainTheme of ['basic', 'theme-1']) {
    fixture(mainTheme);
    const view = mount();
    await view.render();
    assert(context.editorTheme === 'follow', 'Editor does not default to Follow main theme');
    assert(saves.length === 0, 'Mounting an editor wrote preferences');
    for (const [foreground, background] of [
      ['text', 'surface'],
      ['text', 'raised'],
      ['text', 'hover'],
      ['text', 'input'],
      ['text', 'selection'],
      ['muted', 'surface'],
      ['muted', 'raised'],
      ['on-action', 'action'],
      ['on-accent', 'accent'],
      ['danger', 'danger-bg'],
      ['warning', 'warning-bg']
    ]) {
      const ratio = contrast(foreground, background);
      assert(
        ratio >= 4.5,
        `${mainTheme}: ${foreground}/${background} contrast is ${ratio.toFixed(2)}`
      );
    }
    for (const foreground of ['accent', 'focus', 'border']) {
      assert(
        contrast(foreground, 'surface') >= 3,
        `${mainTheme}: ${foreground} not visible on surface`
      );
    }
    const base = color('surface');
    await act(async () => {
      await context.setEditorTheme('light');
    });
    assert(context.theme === 'light', 'Explicit light mode did not apply');
    await act(async () => {
      await context.setEditorTheme('dark');
    });
    assert(context.theme === 'dark', 'Explicit dark mode did not apply');
    await act(async () => {
      await context.setEditorTheme('follow');
    });
    assert(color('surface') === base, 'Follow did not restore the main palette');
    assert(saves.length === 3, 'Changing editor mode did not persist exactly the selected changes');
    await act(async () => {
      emit('theme-preferences-updated', {
        mainTheme: mainTheme === 'basic' ? 'theme-1' : 'basic',
        editorTheme: 'follow'
      });
    });
    assert(color('surface') !== base, 'An open editor did not follow a live main-theme change');
    await view.dispose();
    assert(
      [...listeners.values()].every((set) => set.size === 0),
      'Theme subscription leaked on unmount'
    );
    results.push(
      `PASS: ${mainTheme} paired colors, follow/light/dark modes, live sync, and subscription cleanup`
    );
  }
  {
    fixture('basic');
    const old = deferred();
    window.tagEditApi.getPreferences = () => old.promise;
    const view = mount();
    await view.render();
    await act(async () => {
      emit('theme-preferences-updated', { mainTheme: 'theme-1', editorTheme: 'follow' });
    });
    await act(async () => {
      old.resolve({ mainTheme: 'basic', editorTheme: 'dark' });
    });
    assert(
      context.theme === 'light' && context.editorTheme === 'follow',
      'Stale preference read overwrote a live theme update'
    );
    window.tagEditApi.savePreferences = async () => false;
    await act(async () => {
      await context.setEditorTheme('dark');
    });
    assert(
      context.editorTheme === 'follow' && context.themeError,
      'Failed preference save did not restore the previous mode'
    );
    await view.dispose();
    results.push(
      'PASS: late preference responses and failed saves cannot silently change the theme'
    );
  }
  for (const mainTheme of ['basic', 'theme-1']) {
    fixture(mainTheme);
    const view = mount();
    await view.render(true);
    await act(async () => {
      await frame();
      await frame();
    });
    const grid = document.querySelector('.ag-root-wrapper');
    assert(grid && document.querySelector('.ag-row'), 'Actual AG Grid did not render fixture rows');
    assert(
      getComputedStyle(grid).backgroundColor === color('surface'),
      'Grid background does not match the editor'
    );
    const panel = document.querySelector('.column-panel');
    assert(
      getComputedStyle(panel).backgroundColor === color('raised'),
      'Toolbar background does not use the shared palette'
    );
    const select = document.querySelector('.editor-theme-choice select');
    assert(select?.value === 'follow', 'Theme selector does not show Follow main theme');
    await act(async () => {
      select.value = 'dark';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    assert(context.editorTheme === 'dark', 'Theme selector did not change the actual grid editor');
    await view.dispose();
    results.push(
      `PASS: ${mainTheme} actual AG Grid, toolbar, and theme selector share the palette`
    );
  }
  return results;
})();

let preview;
window.showThemePreview = async (mainTheme) => {
  if (preview) await preview.dispose();
  fixture(mainTheme);
  preview = mount();
  await preview.render(true);
  await act(async () => {
    await frame();
    await frame();
  });
};
