// Run with node --test scripts/testStartupLoader.mjs.
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {registerHooks} from 'node:module';
import {test} from 'node:test';

let latest;
let failLoad = false;
class FakeWindow extends EventEmitter {
  constructor(options) {
    super();
    latest = this;
    this.options = options;
    this.shows = 0;
    this.destroyed = false;
    this.webContents = {
      executeJavaScript: (script) => {
        this.script = script;
        return new Promise((resolve, reject) => {
          this.finishFrames = resolve;
          this.rejectFrames = reject;
        });
      }
    };
  }
  loadFile(file) {
    this.file = file;
    return failLoad ? Promise.reject(new Error('Missing splash page')) : Promise.resolve();
  }
  show() { this.shows++; }
  isDestroyed() { return this.destroyed; }
  destroy() {
    this.destroyed = true;
    this.emit('closed');
    this.rejectFrames?.(new Error('Window closed'));
  }
}
globalThis.__startupLoaderFixture = {BrowserWindow: FakeWindow};
const dataURL = code => 'data:text/javascript,' + encodeURIComponent(code);
const hooks = registerHooks({
  resolve(name, context, next) {
    if (name === 'electron') return {
      url: dataURL('export const {BrowserWindow}=globalThis.__startupLoaderFixture;'), shortCircuit: true
    };
    if (name === '@electron-toolkit/utils') return {
      url: dataURL('export const is={dev:false};'), shortCircuit: true
    };
    return next(name, context);
  }
});
const {createStartupWindow} = await import('../src/main/startupWindow.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('startup loader waits for a visible frame before allowing catalog work', async () => {
  let ready=false;
  const opening=createStartupWindow().then(window=>{ready=true;return window;});
  const window=latest;
  await tick();
  assert.equal(ready,false);
  assert.equal(window.shows,0);
  window.emit('ready-to-show');
  await tick();
  assert.equal(window.shows,1);
  assert.match(window.script,/requestAnimationFrame/);
  assert.equal(ready,false);
  window.finishFrames();
  assert.equal(await opening,window);
  assert.equal(ready,true);
  assert.equal(window.options.webPreferences.nodeIntegration,false);
  assert.equal(window.options.webPreferences.sandbox,true);
  window.destroy();
});

test('closing before the splash paints cancels startup', async () => {
  const opening=createStartupWindow();
  latest.destroy();
  await assert.rejects(opening,{name:'StartupCancelled'});
});

test('closing while waiting for the visible frame cancels startup', async () => {
  const opening=createStartupWindow();
  const window=latest;
  window.emit('ready-to-show');
  await tick();
  window.destroy();
  await assert.rejects(opening,{name:'StartupCancelled'});
});

test('a splash load failure closes its window and reports the failure', async () => {
  failLoad=true;
  try {
    await assert.rejects(createStartupWindow(),/Missing splash page/);
    assert.equal(latest.destroyed,true);
  } finally {failLoad=false;}
});

test.after(()=>{
  hooks.deregister();
  delete globalThis.__startupLoaderFixture;
});
