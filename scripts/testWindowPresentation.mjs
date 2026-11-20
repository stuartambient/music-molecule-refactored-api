import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWindowPresentation } from '../src/main/windowPresentation.js';

class Window {
  bounds = { x: 120, y: 90, width: 800, height: 600 };
  minimum = [0, 0];
  resizable = true;
  maximizable = true;
  maximized = false;
  pinned = false;
  isDestroyed() {
    return false;
  }
  isMaximized() {
    return this.maximized;
  }
  maximize() {
    this.maximized = true;
  }
  unmaximize() {
    this.maximized = false;
  }
  getNormalBounds() {
    return { ...this.bounds };
  }
  setBounds(bounds) {
    this.bounds = { ...bounds };
  }
  getMinimumSize() {
    return [...this.minimum];
  }
  setMinimumSize(...size) {
    this.minimum = size;
  }
  setSize(width, height) {
    this.bounds = { ...this.bounds, width, height };
  }
  isResizable() {
    return this.resizable;
  }
  setResizable(value) {
    this.resizable = value;
  }
  isMaximizable() {
    return this.maximizable;
  }
  setMaximizable(value) {
    this.maximizable = value;
  }
  isAlwaysOnTop() {
    return this.pinned;
  }
  setAlwaysOnTop(value) {
    this.pinned = value;
  }
}
test('solo player stays fixed and cannot maximize; Player + Lists can maximize', () => {
  const window = new Window(),
    view = createWindowPresentation(() => window);
  view.setMode('player');
  assert.equal(window.bounds.width, 300);
  assert.equal(window.resizable, false);
  assert.equal(window.maximizable, false);
  view.setMode('player-library');
  assert.equal(window.bounds.width, 660);
  assert.equal(window.resizable, true);
  assert.equal(window.maximizable, true);
});
test('expanded artwork returns to the exact resized and moved Player + Lists window', () => {
  const window = new Window(),
    view = createWindowPresentation(() => window);
  view.setMode('player-library');
  window.setBounds({ x: -800, y: 70, width: 900, height: 650 });
  view.setArtwork(true);
  assert.equal(window.maximized, true);
  // Repeated opens cannot overwrite the original window snapshot.
  view.setArtwork(true);
  view.setArtwork(false);
  assert.deepEqual(window.bounds, { x: -800, y: 70, width: 900, height: 650 });
  assert.equal(window.maximized, false);
  assert.equal(window.resizable, true);
  assert.deepEqual(window.minimum, [660, 500]);
});
test('artwork opened from a maximized window returns to a maximized window', () => {
  const window = new Window(),
    view = createWindowPresentation(() => window);
  view.setMode('player-library');
  window.maximize();
  view.setArtwork(true);
  window.unmaximize();
  view.setArtwork(false);
  assert.equal(window.maximized, true);
  assert.equal(window.maximizable, true);
});
test('artwork temporarily allows the solo player to maximize then restores its fixed size', () => {
  const window = new Window(),
    view = createWindowPresentation(() => window);
  view.setMode('player');
  view.setArtwork(true);
  assert.equal(window.maximizable, true);
  view.setArtwork(false);
  assert.equal(window.maximizable, false);
  assert.equal(window.resizable, false);
  assert.equal(window.bounds.width, 300);
  assert.equal(window.bounds.height, 500);
});
for (const mode of ['mini', 'mini-expanded']) {
  test(`artwork restores ${mode} position, fixed size, and always-on-top setting`, () => {
    const window = new Window();
    const view = createWindowPresentation(() => window);
    view.setMode(mode);
    window.setBounds({ ...window.bounds, x: 800, y: 130 });
    const bounds = { ...window.bounds };
    const minimum = [...window.minimum];
    assert.equal(window.pinned, true);
    assert.equal(view.setArtwork(true), true);
    assert.equal(window.maximized, true);
    assert.equal(window.pinned, false);
    assert.equal(window.resizable, true);
    assert.equal(view.setArtwork(false), false);
    assert.deepEqual(window.bounds, bounds);
    assert.deepEqual(window.minimum, minimum);
    assert.equal(window.maximized, false);
    assert.equal(window.resizable, false);
    assert.equal(window.maximizable, false);
    assert.equal(window.pinned, true);
  });
}

test('repeating a mode does not reset the user’s resized window', () => {
  const window = new Window(),
    view = createWindowPresentation(() => window);
  view.setMode('player-library');
  window.setBounds({ ...window.bounds, width: 920 });
  view.setMode('player-library');
  assert.equal(window.bounds.width, 920);
});
test('switching modes while artwork is open applies the new mode on exit', () => {
  const window = new Window(),
    view = createWindowPresentation(() => window);
  view.setMode('player-library');
  view.setArtwork(true);
  view.setMode('mini');
  view.setArtwork(false);
  assert.equal(window.bounds.width, 290);
  assert.equal(window.resizable, false);
  assert.equal(window.maximizable, false);
  assert.equal(window.pinned, true);
});
test('a recreated main window receives its mode instead of inheriting the old window state', () => {
  let window = new Window();
  const view = createWindowPresentation(() => window);
  view.setMode('player');
  window = new Window();
  view.setMode('player');
  assert.equal(window.bounds.width, 300);
});
