import assert from 'node:assert/strict';
import { test } from 'node:test';
import { childWindowBounds } from '../src/main/childWindowBounds.js';

const desktop = { x: 0, y: 0, width: 1920, height: 1040 };
const main = { x: 100, y: 100, width: 800, height: 600 };
const size = { width: 1000, height: 700 };

test('editor and cover search cascade with separate title-bar bands', () => {
  const editor = childWindowBounds(main, size, desktop, [main]);
  const cover = childWindowBounds(editor, size, desktop, [main, editor]);
  assert.deepEqual(editor, { x: 140, y: 140, ...size });
  assert.deepEqual(cover, { x: 180, y: 180, ...size });
});

test('independent windows opened from the same main window avoid existing title bars', () => {
  const editor = childWindowBounds(main, size, desktop, [main]);
  const cover = childWindowBounds(main, size, desktop, [main, editor]);
  assert.equal(cover.y, editor.y + 40);
});

test('placement respects a secondary display with negative coordinates', () => {
  const workArea = { x: -1920, y: -200, width: 1920, height: 1040 };
  const opener = { ...main, x: -1500, y: -100 };
  assert.deepEqual(childWindowBounds(opener, size, workArea, [opener]), {
    x: -1460,
    y: -60,
    ...size
  });
});

test('windows near the taskbar stay fully within the usable display', () => {
  const opener = { ...main, x: 1700, y: 950 };
  const bounds = childWindowBounds(opener, size, desktop, [opener]);
  assert.equal(bounds.x, 920);
  assert.equal(bounds.y, 800);
  assert.equal(bounds.height, 240);
  assert.equal(bounds.y + bounds.height, 1040);
});

test('a small display constrains oversized windows without placing them off screen', () => {
  const workArea = { x: 200, y: 100, width: 640, height: 200 };
  assert.deepEqual(childWindowBounds(main, size, workArea, [main]), workArea);
});
