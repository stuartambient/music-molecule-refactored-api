import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateIpcArguments } from '../src/main/ipcValidation.js';
import { canRequest } from '../src/shared/ipcContract.js';
test('mpv exposes bounded controls only to the main player', () => {
  const c = {
    sessionId: 'session',
    ids: ['track-a'],
    index: 0,
    source: 'playlistActive',
    gapless: true,
    startTime: 0,
    volume: 0.5
  };
  assert.doesNotThrow(() => validateIpcArguments('mpv-load', [c], 'main'));
  for (const patch of [
    { audiotrack: 'C:/arbitrary.flac' },
    { executable: 'powershell' },
    { ids: [] },
    { index: 1 },
    { startTime: NaN },
    { volume: 2 },
    { source: 'editor' }
  ])
    assert.throws(() => validateIpcArguments('mpv-load', [{ ...c, ...patch }], 'main'));
  for (const command of [
    { operation: 'run', value: 'anything' },
    { operation: 'seek', value: -1 },
    { operation: 'pause', value: 'false' },
    { operation: 'volume', value: 2 }
  ])
    assert.throws(() =>
      validateIpcArguments('mpv-control', [{ sessionId: 'session', ...command }], 'main')
    );
  for (const role of ['editor', 'cover-search', 'recovery'])
    for (const channel of ['mpv-load', 'mpv-control', 'mpv-stop', 'mpv-status', 'mpv-update-queue'])
      assert.equal(canRequest(role, 'invoke', channel), false);
  assert.throws(() =>
    validateIpcArguments('save-preferences', [{ playbackBackend: 'mpv' }], 'editor')
  );
});
