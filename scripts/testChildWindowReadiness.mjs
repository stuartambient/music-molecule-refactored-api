// Run with node --test scripts/testChildWindowReadiness.mjs. Uses simulated Electron windows.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

const ipcMain = new EventEmitter();
const mainMessages = [];
const mainWindow = {
  destroyed: false,
  isDestroyed() {
    return this.destroyed;
  },
  getBounds() {
    return { x: 100, y: 100, width: 800, height: 600 };
  },
  webContents: {
    send(...args) {
      mainMessages.push(args);
    }
  }
};
class FakeWindow extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.destroyed = false;
    this.minimized = false;
    this.shows = 0;
    this.focuses = 0;
    this.restores = 0;
    this.messages = [];
    this.webContents = new EventEmitter();
    this.webContents.mainFrame = {};
    this.webContents.setWindowOpenHandler = (handler) => {
      this.openWindowHandler = handler;
    };
    this.webContents.send = (...args) => this.messages.push(args);
  }
  getBounds() {
    return { x: 100, y: 100, width: 800, height: 600, ...this.options };
  }
  removeMenu() {}
  loadFile(file) {
    this.file = file;
    this.webContents.emit('did-start-navigation', {
      url: file,
      isSameDocument: false,
      isMainFrame: true
    });
    return Promise.resolve();
  }
  loadURL(url) {
    return this.loadFile(url);
  }
  isDestroyed() {
    return this.destroyed;
  }
  isMinimized() {
    return this.minimized;
  }
  restore() {
    this.minimized = false;
    this.restores++;
  }
  show() {
    this.shows++;
  }
  focus() {
    this.focuses++;
  }
  close() {
    this.emit('close');
    this.destroyed = true;
    this.emit('closed');
  }
}
globalThis.__childWindowFixture = {
  ipcMain,
  mainWindow,
  BrowserWindow: FakeWindow,
  screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) }
};
const mockModule = (source) => 'data:text/javascript,' + encodeURIComponent(source);
const electron = mockModule(
  'export const { ipcMain, BrowserWindow, screen } = globalThis.__childWindowFixture;'
);
const index = mockModule(
  'export const { mainWindow } = globalThis.__childWindowFixture; export const theme="dark";'
);
const toolkit = mockModule('export const is = { dev: false };');
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'electron') return { url: electron, shortCircuit: true };
    if (specifier === '@electron-toolkit/utils') return { url: toolkit, shortCircuit: true };
    if (specifier === './index.js' && context.parentURL.endsWith('/windowManager.js')) {
      return { url: index, shortCircuit: true };
    }
    return next(specifier, context);
  }
});
const { createOrUpdateChildWindow, sendToChild, getWindow, getWindowNames } = await import(
  '../src/main/windowManager.js'
);
const config = {
  width: 800,
  height: 600,
  show: false,
  preload: 'metadataEditing',
  sandbox: true,
  webSecurity: true,
  contextIsolation: true
};
const data = (id) => ({ listType: id, results: [{ track_id: id }] });
function open(name, payload = data(name), options = config) {
  createOrUpdateChildWindow(name, 'test', options, payload);
  return getWindow(name);
}
function ready(window, frame = window.webContents.mainFrame) {
  ipcMain.emit('child-ready', { sender: window.webContents, senderFrame: frame });
}
const paint = (window) => window.emit('ready-to-show');
const payloads = (window) =>
  window.messages.filter(([channel]) => channel === 'send-to-child').map(([, payload]) => payload);

test('child readiness is owned by each window', async (suite) => {
  suite.afterEach(() => {
    for (const name of getWindowNames()) getWindow(name).close();
  });
  try {
    await suite.test(
      'cover search cannot open another app window or navigate its host document',
      () => {
        const cover = open('cover', data('cover'), { ...config, preload: 'coverSearchAlt' });
        assert.deepEqual(cover.openWindowHandler({ url: 'https://example.com' }), {
          action: 'deny'
        });
        let prevented = false;
        cover.webContents.emit('will-navigate', {
          preventDefault() {
            prevented = true;
          }
        });
        assert.equal(prevented, true);
      }
    );
    await suite.test(
      'independent editor and cover windows are offset without adding a parent',
      () => {
        const grid = open('grid');
        const cover = open('cover');
        assert.equal(grid.options.parent, null);
        assert.equal(cover.options.parent, null);
        assert.equal(grid.options.y, 140);
        assert.equal(cover.options.y, 180);
        assert.equal(grid.options.modal, false);
      }
    );
    await suite.test(
      'cover search opened by the editor keeps its existing modal relationship',
      () => {
        const grid = open('grid');
        const cover = open('cover', data('cover'), { ...config, parent: 'grid' });
        assert.equal(cover.options.parent, grid);
        assert.equal(cover.options.modal, true);
        assert.equal(cover.options.x, grid.options.x + 40);
        assert.equal(cover.options.y, grid.options.y + 40);
      }
    );
    await suite.test('one child cannot release the other child data', () => {
      const grid = open('grid');
      const cover = open('cover', data('cover'), { ...config, preload: 'coverSearchAlt' });
      ready(cover);
      paint(grid);
      assert.deepEqual(payloads(grid), []);
      assert.deepEqual(payloads(cover), []);
      paint(cover);
      assert.deepEqual(payloads(cover), [data('cover')]);
      assert.deepEqual(payloads(grid), []);
      ready(grid);
      assert.deepEqual(payloads(grid), [data('grid')]);
      assert.equal(grid.shows, 1);
      assert.equal(cover.shows, 1);
    });
    await suite.test('both ready-signal orders deliver exactly once', () => {
      const first = open('first'),
        second = open('second');
      ready(first);
      paint(first);
      paint(second);
      ready(second);
      ready(first);
      ready(second);
      assert.deepEqual(payloads(first), [data('first')]);
      assert.deepEqual(payloads(second), [data('second')]);
    });
    await suite.test('updates during startup deliver only the latest selection', () => {
      const grid = open('grid', data('old'));
      sendToChild('grid', data('artist'));
      createOrUpdateChildWindow('grid', 'test', config, data('genre'));
      assert.equal(getWindow('grid'), grid);
      paint(grid);
      ready(grid);
      assert.deepEqual(payloads(grid), [data('genre')]);
    });
    await suite.test('menu selections update the existing ready grid immediately', () => {
      const grid = open('grid');
      paint(grid);
      ready(grid);
      assert.equal(sendToChild('grid', data('different-menu')), true);
      assert.equal(getWindow('grid'), grid);
      assert.deepEqual(payloads(grid), [data('grid'), data('different-menu')]);
    });
    await suite.test('unknown windows and subframes cannot release queued data', () => {
      const grid = open('grid'),
        unknown = new FakeWindow();
      paint(grid);
      ready(unknown);
      ready(grid, {});
      ipcMain.emit('child-ready', { sender: grid.webContents, senderFrame: null });
      assert.deepEqual(payloads(grid), []);
      ready(grid);
      assert.deepEqual(payloads(grid), [data('grid')]);
    });
    await suite.test('reload queues data again until the new top-level renderer is ready', () => {
      const grid = open('grid');
      paint(grid);
      ready(grid);
      const oldFrame = grid.webContents.mainFrame;
      grid.webContents.emit('did-start-navigation', {
        url: 'reloaded.html',
        isSameDocument: false,
        isMainFrame: true
      });
      grid.webContents.mainFrame = {};
      sendToChild('grid', data('after-reload'));
      ready(grid, oldFrame);
      assert.deepEqual(payloads(grid), [data('grid')]);
      ready(grid);
      assert.deepEqual(payloads(grid), [data('grid'), data('after-reload')]);
    });
    await suite.test(
      'iframe navigation and same-document navigation leave the parent renderer ready',
      () => {
        const cover = open('cover');
        paint(cover);
        ready(cover);
        cover.webContents.emit('did-start-navigation', {
          url: 'https://cover.example/',
          isSameDocument: false,
          isMainFrame: false
        });
        sendToChild('cover', data('second-search'));
        cover.webContents.emit('did-start-navigation', {
          url: 'cover.html#fragment',
          isSameDocument: true,
          isMainFrame: true
        });
        sendToChild('cover', data('third-search'));
        assert.deepEqual(payloads(cover), [
          data('cover'),
          data('second-search'),
          data('third-search')
        ]);
      }
    );
    await suite.test('closing and reopening cannot deliver an old window payload', () => {
      const old = open('grid', data('old'));
      old.close();
      const current = open('grid', data('new'));
      paint(current);
      ready(old);
      assert.deepEqual(payloads(current), []);
      ready(current);
      assert.deepEqual(payloads(current), [data('new')]);
      assert.equal(sendToChild('missing', data('unused')), false);
    });
    await suite.test('a reopen requested during closing waits for a new window', async () => {
      const old = open('grid', data('old'));
      old.emit('close');
      paint(old);
      assert.equal(old.shows, 0);
      const reopening = createOrUpdateChildWindow('grid', 'test', config, data('new'));
      assert.equal(getWindow('grid'), undefined);
      assert.equal(sendToChild('grid', data('late-old-selection')), false);
      ready(old);
      assert.deepEqual(payloads(old), []);
      old.destroyed = true;
      old.emit('closed');
      await reopening;
      const current = getWindow('grid');
      assert.notEqual(current, old);
      paint(current);
      ready(current);
      assert.deepEqual(payloads(current), [data('new')]);
    });
    await suite.test('reopening a minimized child restores and focuses that window', () => {
      const grid = open('grid');
      paint(grid);
      ready(grid);
      grid.minimized = true;
      createOrUpdateChildWindow('grid', 'test', config, data('new'));
      assert.equal(grid.restores, 1);
      assert.equal(grid.focuses, 1);
      assert.equal(grid.shows, 2);
      assert.equal(getWindowNames().length, 1);
      assert.deepEqual(payloads(grid).at(-1), data('new'));
    });
    await suite.test(
      'all children share one sender-routed listener without removing other listeners',
      () => {
        const additional = () => {};
        ipcMain.on('child-ready', additional);
        open('first');
        open('second');
        open('third');
        assert.equal(ipcMain.listenerCount('child-ready'), 2);
        ipcMain.removeListener('child-ready', additional);
        assert.equal(ipcMain.listenerCount('child-ready'), 1);
      }
    );
    await suite.test('an old close event cannot remove a replacement window', () => {
      const old = open('grid');
      old.destroyed = true;
      const current = open('grid');
      const before = mainMessages.length;
      old.emit('closed');
      assert.equal(getWindow('grid'), current);
      assert.equal(mainMessages.length, before);
    });
    await suite.test('closing children after the main window closes is safe', () => {
      const grid = open('grid');
      mainWindow.destroyed = true;
      const before = mainMessages.length;
      assert.doesNotThrow(() => grid.close());
      assert.equal(mainMessages.length, before);
      mainWindow.destroyed = false;
    });
  } finally {
    for (const name of getWindowNames()) getWindow(name).close();
    hooks.deregister();
    delete globalThis.__childWindowFixture;
  }
});
