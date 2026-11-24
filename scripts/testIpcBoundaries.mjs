import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { registerHooks, createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { ipcContracts, canRequest } from '../src/shared/ipcContract.js';
import { createBridge } from '../src/preload/createBridge.js';
import { validateIpcArguments, hasIpcValidator } from '../src/main/ipcValidation.js';

const ipcMain = new EventEmitter();
const handlers = new Map();
ipcMain.handle = (channel, handler) => handlers.set(channel, handler);
globalThis.__ipcBoundaryFixture = { ipcMain };
const data = (source) => 'data:text/javascript,' + encodeURIComponent(source);
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'electron')
      return {
        url: data('export const {ipcMain}=globalThis.__ipcBoundaryFixture;'),
        shortCircuit: true
      };
    if (specifier === '@electron-toolkit/utils')
      return { url: data('export const is={dev:false};'), shortCircuit: true };
    return next(specifier, context);
  }
});
const { registerWindowAccess, authorizeIpc, configureIpcCatalog, grantArtworkAccess, guardedIpc } =
  await import('../src/main/ipcAccess.js');
const audio = path.resolve('fixture/music/a.mp3');
const approvedImage = path.resolve('fixture/cover.jpg');
configureIpcCatalog(() => ({
  prepare: (sql) => ({
    get: (key) =>
      sql.includes('WHERE track_id')
        ? key === 'track-a'
          ? { audiotrack: audio }
          : undefined
        : key === audio
          ? { track_id: 'track-a' }
          : undefined
  })
}));
function windowFor(role) {
  const window = new EventEmitter();
  window.destroyed = false;
  window.webContents = new EventEmitter();
  window.webContents.isDestroyed = () => window.destroyed;
  window.webContents.mainFrame = {
    url: pathToFileURL(path.resolve('fixture/renderer', role + '.html')).href
  };
  registerWindowAccess(window, role, window.webContents.mainFrame.url);
  return window;
}
const event = (window) => ({
  sender: window.webContents,
  senderFrame: window.webContents.mainFrame
});
const allow = (window, channel, args = [], direction = 'invoke') =>
  authorizeIpc(event(window), direction, channel, args);

test('each preload exposes only named operations for its role, without generic invoke/send', () => {
  for (const role of Object.keys(ipcContracts)) {
    const renderer = new EventEmitter();
    renderer.invoke = (...args) => args;
    renderer.send = (...args) => args;
    const api = createBridge(renderer, role);
    assert.equal(api.invoke, undefined);
    assert.equal(api.send, undefined);
    assert.deepEqual(
      Object.keys(api).sort(),
      [
        ...Object.keys(ipcContracts[role].invoke),
        ...Object.keys(ipcContracts[role].send),
        'on',
        'once',
        'off'
      ].sort()
    );
    assert.equal(typeof api.updateTags, role === 'editor' ? 'function' : 'undefined');
    assert.equal(typeof api.dbRepair, role === 'recovery' ? 'function' : 'undefined');
    assert.equal(typeof api.downloadTagImage, role === 'tag-cover' ? 'function' : 'undefined');
    assert.throws(() => api.on('unlisted-event', () => {}));
  }
});
test('event callbacks receive data without the privileged event and unsubscribe correctly', () => {
  const renderer = new EventEmitter();
  const api = createBridge(renderer, 'editor');
  const messages = [];
  const listener = (...args) => messages.push(args);
  const off = api.on('send-to-child', listener);
  renderer.emit('send-to-child', { secret: true }, { results: [] });
  assert.deepEqual(messages, [[{ results: [] }]]);
  off();
  assert.equal(renderer.listenerCount('send-to-child'), 0);
  api.once('send-to-child', listener);
  renderer.emit('send-to-child', {}, 1);
  renderer.emit('send-to-child', {}, 2);
  assert.equal(messages.length, 2);
  api.on('send-to-child', listener);
  api.off('send-to-child', listener);
  assert.equal(renderer.listenerCount('send-to-child'), 0);
});
test('the registered owner, top-level frame, and exact renderer document are all required', () => {
  const main = windowFor('main');
  assert.equal(allow(main, 'get-tracks', [null, '', 'ASC']), 'main');
  assert.throws(() =>
    authorizeIpc(
      { ...event(main), senderFrame: { url: main.webContents.mainFrame.url } },
      'invoke',
      'get-tracks',
      [null, '', 'ASC']
    )
  );
  const original = main.webContents.mainFrame.url;
  main.webContents.mainFrame.url = 'https://example.com/index.html';
  assert.throws(() => allow(main, 'get-roots'));
  main.webContents.mainFrame.url = original;
  main.destroyed = true;
  assert.throws(() => allow(main, 'get-roots'));
  const other = { sender: { isDestroyed: () => false, mainFrame: {} }, senderFrame: {} };
  assert.throws(() => authorizeIpc(other, 'invoke', 'get-roots', []));
});
test('main, recovery, editor, and cover permissions are distinct on the main-process side', () => {
  const main = windowFor('main'),
    recovery = windowFor('recovery'),
    editor = windowFor('editor'),
    cover = windowFor('cover');
  assert.throws(() => allow(main, 'db-repair'));
  assert.equal(allow(recovery, 'db-repair'), 'recovery');
  assert.throws(() => allow(recovery, 'update-roots', [[audio]]));
  assert.throws(() => allow(cover, 'update-tags', [[]]));
  assert.throws(() => allow(editor, 'update-folders'));
  assert.throws(() => allow(main, 'update-tags', [[]]));
  assert.equal(
    allow(cover, 'download-file', ['https://cdn.example.com/cover.jpg', path.dirname(audio)]),
    'cover'
  );
});
test('malformed sort, pagination, root, menu, and preference arguments are rejected', () => {
  const main = windowFor('main'),
    editor = windowFor('editor');
  for (const args of [
    [-1, '', 'ASC'],
    [null, '', 'DESC; DROP TABLE albums'],
    [null, {}, 'ASC']
  ])
    assert.throws(() => allow(main, 'get-tracks', args));
  assert.throws(() => allow(main, 'update-roots', [['relative/path']]));
  assert.throws(() => allow(editor, 'save-preferences', [{ mainTheme: 'theme-1' }]));
  assert.throws(() => allow(main, 'save-preferences', [{ schedule: 'everyday@99:99' }]));
  assert.throws(() =>
    allow(main, 'save-preferences', [JSON.parse('{"__proto__":{"polluted":true}}')])
  );
  assert.equal(
    allow(editor, 'save-preferences', [
      {
        theme: 'dark',
        grids: {
          tagEdit: { columns: [{ colId: 'title', width: 180, sort: null, flex: undefined }] }
        }
      }
    ]),
    'editor'
  );
  assert.equal(
    allow(main, 'save-preferences', [{ schedule: { Monday: '09:30', Tuesday: '' } }]),
    'main'
  );
  assert.throws(() => allow(coverWindow(), 'show-context-menu', [1, 'menu'], 'send'));
  function coverWindow() {
    return windowFor('cover');
  }
});
test('renderers cannot supply preload paths or window security settings', () => {
  const main = windowFor('main'),
    editor = windowFor('editor');
  const request = { name: 'table-data', data: { listType: 'artist-tracks', results: null } };
  assert.equal(allow(main, 'show-child', [request]), 'main');
  assert.throws(() =>
    allow(main, 'show-child', [
      { ...request, winConfig: { preload: '../../evil', sandbox: false } }
    ])
  );
  assert.throws(() => allow(editor, 'show-child', [request]));
  assert.throws(() =>
    allow(main, 'show-child', [{ name: 'arbitrary', data: { listType: 'x', results: [] } }])
  );
  assert.equal(
    allow(editor, 'show-child', [
      {
        name: 'cover-search-alt-tags',
        data: {
          listType: 'cover-search-alt-tags',
          results: { artist: 'Artist', title: 'Album', path: audio }
        }
      }
    ]),
    'editor'
  );
});
test('tag writes and rescans must match the catalog, and artwork must come from a picker or download', () => {
  const editor = windowFor('editor');
  const edit = { id: audio, track_id: 'track-a', updates: { title: 'Updated' } };
  assert.equal(allow(editor, 'update-tags', [[edit]]), 'editor');
  assert.throws(() =>
    allow(editor, 'update-tags', [[{ ...edit, id: path.resolve('outside.mp3') }]])
  );
  assert.throws(() =>
    allow(editor, 'update-tags', [[{ ...edit, updates: { audiotrack: 'other' } }]])
  );
  assert.throws(() => allow(editor, 'rescan-track-error', [audio, 'wrong-id']));
  assert.equal(allow(editor, 'rescan-track-error', [audio, 'track-a']), 'editor');
  const withImage = { ...edit, updates: { 'picture-location': approvedImage } };
  assert.throws(() => allow(editor, 'update-tags', [[withImage]]));
  grantArtworkAccess(editor.webContents, approvedImage);
  assert.equal(allow(editor, 'update-tags', [[withImage]]), 'editor');
  assert.throws(() => allow(windowFor('editor'), 'update-tags', [[withImage]]));
});
test('closed or navigated windows cannot keep their permissions', () => {
  const main = windowFor('main');
  let prevented = false;
  main.webContents.emit('will-navigate', {
    url: 'https://example.com',
    preventDefault() {
      prevented = true;
    }
  });
  assert(prevented);
  main.emit('closed');
  assert.throws(() => allow(main, 'get-roots'));
});
test('all registered handlers have a validator and per-window permission', () => {
  const require = createRequire(import.meta.url);
  const parser = require('@babel/parser');
  const channels = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee?.object?.name === 'guardedIpc')
      channels.push([
        node.callee.property.name === 'handle' ? 'invoke' : 'send',
        node.arguments[0].value
      ]);
    for (const value of Object.values(node))
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) value.forEach(walk);
        else walk(value);
      }
  }
  for (const name of ['index.js', 'windowManager.js'])
    walk(
      parser.parse(fs.readFileSync(new URL('../src/main/' + name, import.meta.url), 'utf8'), {
        sourceType: 'module'
      })
    );
  for (const [direction, channel] of channels) {
    assert(hasIpcValidator(channel), channel);
    assert(
      Object.keys(ipcContracts).some((role) => canRequest(role, direction, channel)),
      channel
    );
  }
  assert.throws(() => guardedIpc.handle('undeclared', () => {}));
  assert.equal(channels.filter(([, name]) => name === 'window-action').length, 1);
});
hooks.deregister();

test('library cursor envelopes accept bounded keys and reject malformed payloads', () => {
  const main = windowFor('main');
  const cursor = { scope: JSON.stringify(['tracks', 'ASC', '', false]), key: [null, 'track', 12] };
  assert.equal(allow(main, 'get-tracks', [cursor, '', 'ASC']), 'main');
  for (const malformed of [
    0,
    {},
    [],
    { ...cursor, extra: true },
    { ...cursor, key: [1, 'track', 1.5] },
    { ...cursor, key: [1, 'track', 12, 13] },
    { ...cursor, key: [true, 'track', 12] },
    { ...cursor, scope: 'x'.repeat(20000) }
  ]) {
    assert.throws(() => allow(main, 'get-tracks', [malformed, '', 'ASC']));
  }
});
