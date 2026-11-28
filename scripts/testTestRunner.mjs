import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

// Exercise the real runner with synthetic scripts, without Electron or real tests.
test('test runner reports failures, continues, lists groups and rejects invalid selections', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'music-test-runner-'));
  const scripts = path.join(root, 'scripts');
  fs.mkdirSync(scripts);
  const source = fileURLToPath(new URL('./', import.meta.url));
  try {
    fs.copyFileSync(path.join(source, 'runTests.mjs'), path.join(scripts, 'runTests.mjs'));
    // Satisfy the manifest using inert placeholders, never copy real test bodies.
    for (const file of fs.readdirSync(source)) {
      if (/^test.+\.(mjs|cjs)$/.test(file)) fs.writeFileSync(path.join(scripts, file), '');
    }
    fs.writeFileSync(
      path.join(scripts, 'testAAAAFailure.mjs'),
      "throw new Error('intentional runner fixture failure');"
    );
    fs.writeFileSync(
      path.join(scripts, 'testZZZZContinued.mjs'),
      "import fs from 'node:fs'; fs.writeFileSync('continued', 'yes');"
    );
    const run = (selection) =>
      spawnSync(process.execPath, [path.join(scripts, 'runTests.mjs'), selection], {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true
      });
    const list = run('--list');
    assert.equal(list.status, 0, list.stderr);
    for (const group of ['unit', 'catalog', 'ui', 'audio', 'mpv'])
      assert.ok(list.stdout.includes(group));
    assert.equal(run('unknown-group').status, 2);
    const result = run('unit');
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /1 failed/);
    assert.match(result.stderr, /FAIL unit\/testAAAAFailure.mjs \(exit 1\)/);
    assert.equal(fs.readFileSync(path.join(root, 'continued'), 'utf8'), 'yes');
    fs.unlinkSync(path.join(scripts, 'testAAAAFailure.mjs'));
    const success = run('unit');
    assert.equal(success.status, 0, success.stderr);
    assert.match(success.stdout, /0 failed/);
  } finally {
    assert.equal(path.dirname(root), os.tmpdir());
    assert.ok(path.basename(root).startsWith('music-test-runner-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
