import React, { act, useLayoutEffect, useReducer } from 'react';
import { createRoot } from 'react-dom/client';
import { MainAudioContext } from '../src/renderer/src/mainAudioContext';
import reducer from '../src/renderer/src/audioPlayerReducer';
import Update from '../src/renderer/src/components/Update';
import MainNav from '../src/renderer/src/components/MainNav';
import { mainThemes } from '../src/shared/themePreferences';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const style = document.createElement('style');
style.textContent = window.settingsCss;
document.head.append(style);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
let listeners,
  preferences,
  saves,
  folderSaves,
  roots,
  state,
  dispatch,
  failSave,
  failRoots,
  failPreferences;
function fixture(mainTheme = 'basic') {
  preferences = { mainTheme, schedule: { Monday: '08:30' } };
  roots = ['C:\\Music\\Library', 'D:\\Archive\\Concert recordings'];
  saves = [];
  folderSaves = [];
  listeners = new Map();
  failSave = failRoots = failPreferences = false;
  window.ipcApi = {
    on(channel, callback) {
      if (!listeners.has(channel)) listeners.set(channel, new Set());
      listeners.get(channel).add(callback);
      return () => listeners.get(channel).delete(callback);
    },
    async getRoots() {
      if (failRoots) throw Error('offline');
      return [...roots];
    },
    async getPreferences() {
      if (failPreferences) throw Error('unavailable');
      return preferences;
    },
    async savePreferences(patch) {
      saves.push(patch);
      if (failSave) return false;
      preferences = { ...preferences, ...patch };
      return true;
    },
    async pickFolder() {
      return ['E:\\New music', 'E:\\New music'];
    },
    async updateRoots(next) {
      folderSaves.push(next);
      roots = next;
      return [{ Inserted: 1 }];
    },
    openAlbumFolder() {}
  };
}
function Fixture({ mainTheme, update }) {
  const [current, send] = useReducer(reducer, {
    mainTheme,
    update,
    setup: 'setup',
    home: false,
    player: false,
    library: false,
    tagEditor: false,
    minimalmode: false,
    miniModePlaylist: false
  });
  state = current;
  dispatch = send;
  useLayoutEffect(() => {
    document.documentElement.classList.remove(...mainThemes);
    document.documentElement.classList.add(current.mainTheme);
  }, [current.mainTheme]);
  return (
    <MainAudioContext.Provider value={{ state: current, dispatch: send }}>
      <div className={`container container-update ${current.mainTheme}`}>
        <MainNav onClick={() => {}} />
        {current.update && <Update />}
      </div>
    </MainAudioContext.Provider>
  );
}
async function mount(mainTheme = 'basic', update = true) {
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  await act(async () => {
    root.render(
      <React.StrictMode>
        <Fixture mainTheme={mainTheme} update={update} />
      </React.StrictMode>
    );
  });
  await act(async () => {
    await frame();
  });
  return async () => {
    await act(async () => {
      root.unmount();
    });
    element.remove();
  };
}
const click = (element) =>
  act(async () => {
    element.click();
  });
const form = (name) => document.querySelector(`form[aria-label="${name}"]`);
const save = (name) =>
  act(async () => {
    form(name).requestSubmit();
  });
const section = (id) =>
  act(async () => {
    dispatch({ type: 'config-options', setup: id });
    await frame();
  });
const setTime = (input, value) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
const button = (text) =>
  [...document.querySelectorAll('.settings-page button')].find(
    (element) => element.textContent === text
  );
function contrast(foreground, background) {
  const light = (color) => {
    const rgb = color
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number)
      .map((n) => {
        n /= 255;
        return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
      });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const values = [light(foreground), light(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
window.checkSettingsLayout = () => {
  const content = document.querySelector('.settings-content');
  assert(content.scrollWidth <= content.clientWidth + 1, 'Settings content overflows horizontally');
  assert(
    document.documentElement.scrollWidth <= innerWidth + 1,
    'Settings window overflows horizontally'
  );
};

window.settingsTests = (async () => {
  const results = [];
  for (const theme of ['basic', 'theme-1']) {
    fixture(theme);
    const dispose = await mount(theme);
    assert(
      document.querySelectorAll('.settings-card').length === 4,
      'Settings sections are not on one page'
    );
    assert(
      document.querySelectorAll('.settings-page form').length === 3,
      'Settings forms are missing'
    );
    assert(!document.querySelector('form form'), 'Settings forms are nested');
    await section('preferences');
    const option = document.querySelector('.theme-option');
    const colors = getComputedStyle(option);
    assert(
      contrast(colors.color, colors.backgroundColor) >= 4.5,
      `${theme}: theme option text is unreadable`
    );
    window.checkSettingsLayout();
    const newTheme = theme === 'basic' ? 'theme-1' : 'basic';
    await click(document.querySelector(`input[name="theme"][value="${newTheme}"]`));
    await section('schedule');
    const monday = form('Update schedule').querySelector('input[type="time"]');
    await setTime(monday, '09:45');
    await section('setup');
    await click(button('Browse for folders…'));
    assert(
      document.querySelectorAll('.pending-folders li').length === 1,
      'Folder picker duplicates were not removed'
    );
    assert(
      folderSaves.length === 0 && saves.length === 0,
      'Navigating settings saved a form automatically'
    );
    await section('preferences');
    assert(
      document.querySelector(`input[name="theme"][value="${newTheme}"]`).checked,
      'Section navigation lost the draft theme'
    );
    await save('Theme preferences');
    assert(
      state.mainTheme === newTheme && saves[0].mainTheme === newTheme,
      'Applying the theme did not update main state'
    );
    await section('schedule');
    assert(
      form('Update schedule').querySelector('input[type="time"]').value === '09:45',
      'Section navigation lost the draft schedule'
    );
    failSave = true;
    await save('Update schedule');
    assert(
      form('Update schedule').querySelector('[role="alert"]'),
      'Failed schedule save is silent'
    );
    assert(
      !form('Update schedule').querySelector('fieldset').disabled,
      'Failed schedule save leaves the form disabled'
    );
    failSave = false;
    await save('Update schedule');
    assert(preferences.schedule.Monday === '09:45', 'Custom schedule was not saved');
    await click(form('Update schedule').querySelector('input[type="checkbox"]'));
    await setTime(form('Update schedule').querySelector('input[type="time"]'), '07:15');
    await save('Update schedule');
    assert(preferences.schedule === 'everyday@07:15', 'Daily schedule format changed');
    await click(button('Clear all'));
    await save('Update schedule');
    assert(
      Object.values(preferences.schedule).every((value) => value === ''),
      'Empty schedule does not disable automatic updates'
    );
    await section('setup');
    await save('Music folders');
    assert(
      folderSaves.length === 1 && folderSaves[0].includes('E:\\New music'),
      'Explicit folder save lost pending additions'
    );
    assert(!document.querySelector('.pending-folders'), 'Saved folders are still shown as pending');
    await dispose();
    assert(
      [...listeners.values()].every((value) => value.size === 0),
      'Settings navigation leaked listeners'
    );
    results.push(
      `PASS: ${theme} readable theme choices, four persistent sections, explicit folder/theme/schedule saves, and save failure recovery`
    );
  }
  {
    fixture();
    failRoots = failPreferences = true;
    const dispose = await mount();
    assert(!form('Music folders'), 'Failed roots load exposes an empty editable list');
    assert(
      form('Update schedule').querySelector('fieldset').disabled,
      'Failed schedule load allows overwriting saved data'
    );
    assert(
      saves.length === 0 && folderSaves.length === 0,
      'Failed initial loads changed saved settings'
    );
    failRoots = failPreferences = false;
    await click(button('Retry loading folders'));
    await click(button('Retry loading schedule'));
    assert(
      form('Music folders') && !form('Update schedule').querySelector('fieldset').disabled,
      'Settings loads cannot be retried'
    );
    await dispose();
    results.push('PASS: failed settings loads preserve saved data and can be retried');
  }
  {
    fixture();
    const dispose = await mount('basic', false);
    await act(async () => {
      for (const listener of listeners.get('hamburger-menu-command')) listener('settings');
    });
    assert(
      state.update && document.querySelector('#settings-title'),
      'Settings menu command does not open the unified page'
    );
    await act(async () => {
      for (const listener of listeners.get('hamburger-menu-command')) listener('theme-preferences');
    });
    assert(
      state.setup === 'preferences' && document.querySelectorAll('.settings-card').length === 4,
      'Existing theme link does not target the shared page'
    );
    await dispose();
    results.push('PASS: the Settings menu and existing section links open the unified page');
  }
  return results;
})();

let disposePreview;
window.showSettingsPreview = async (theme) => {
  if (disposePreview) await disposePreview();
  fixture(theme);
  disposePreview = await mount(theme);
  assert(
    form('Music folders') && !document.querySelector('.settings-page [role="alert"]'),
    'Preview did not load settings'
  );
  await frame();
  await frame();
};
window.showSettingsSection = async (id) => {
  await section(id);
  await frame();
  await frame();
};
