import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerHooks } from 'node:module';
import { normalizeMainTheme, normalizeEditorTheme } from '../src/shared/themePreferences.js';
import { validateIpcArguments } from '../src/main/ipcValidation.js';

test('theme names are normalized and the editor defaults to following the main theme', () => {
  for (const value of [undefined, null, '', 'undefined', 'unknown']) {
    assert.equal(normalizeMainTheme(value), 'basic');
    assert.equal(normalizeEditorTheme(value), 'follow');
  }
  assert.equal(normalizeMainTheme('theme-1'), 'theme-1');
  for (const value of ['follow', 'light', 'dark']) assert.equal(normalizeEditorTheme(value), value);
});

test('editor theme preference and subscription keep IPC role boundaries', () => {
  for (const value of ['follow', 'light', 'dark']) {
    assert.doesNotThrow(() =>
      validateIpcArguments('save-preferences', [{ editorTheme: value }], 'editor')
    );
  }
  assert.throws(() =>
    validateIpcArguments('save-preferences', [{ editorTheme: 'unknown' }], 'editor')
  );
  assert.throws(() => validateIpcArguments('save-preferences', [{ mainTheme: 'basic' }], 'editor'));
  assert.throws(() =>
    validateIpcArguments('save-preferences', [{ editorTheme: 'follow' }], 'main')
  );
});

test('Gapless preference accepts only a boolean from the main renderer', () => {
  for (const enabled of [true, false])
    assert.doesNotThrow(() =>
      validateIpcArguments('save-preferences', [{ playlistGapless: enabled }], 'main')
    );
  for (const enabled of ['true', 1, null])
    assert.throws(() =>
      validateIpcArguments('save-preferences', [{ playlistGapless: enabled }], 'main')
    );
  for (const role of ['editor', 'cover', 'recovery'])
    assert.throws(() =>
      validateIpcArguments('save-preferences', [{ playlistGapless: true }], role)
    );
});

test('concurrent theme, playback and grid saves all persist before their callers resolve', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'theme-preferences-'));
  const file = join(directory, 'preferences.json');
  writeFileSync(file, JSON.stringify({ unrelated: 'preserved' }));
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === './paths.js' && context.parentURL.endsWith('/preferences.js')) {
        return {
          url:
            'data:text/javascript,' +
            encodeURIComponent(`export const paths = { preferences: ${JSON.stringify(file)} };`),
          shortCircuit: true
        };
      }
      return next(specifier, context);
    },
    load(url, context, next) {
      const result = next(url, context);
      if (url.endsWith('/preferences.js')) {
        return {
          ...result,
          source: String(result.source).replace('import.meta.env.MODE', "'production'")
        };
      }
      return result;
    }
  });
  try {
    const { savePreferences } = await import('../src/main/preferences.js');
    assert.deepEqual(
      await Promise.all([
        savePreferences({ mainTheme: 'theme-1' }),
        savePreferences({ editorTheme: 'follow' }),
        savePreferences({ playlistGapless: true }),
        savePreferences({ grids: { tagEdit: { columns: [{ colId: 'title', width: 240 }] } } })
      ]),
      [true, true, true, true]
    );
    const saved = JSON.parse(readFileSync(file));
    assert.equal(saved.unrelated, 'preserved');
    assert.equal(saved.mainTheme, 'theme-1');
    assert.equal(saved.editorTheme, 'follow');
    assert.equal(saved.playlistGapless, true);
    assert.equal(saved.grids.tagEdit.columns[0].width, 240);
  } finally {
    hooks.deregister();
    unlinkSync(file);
    rmdirSync(directory);
  }
});
