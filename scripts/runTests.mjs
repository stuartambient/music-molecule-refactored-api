import process from 'node:process';
import console from 'node:console';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const catalog = new Set([
  'testAlbumCoverSelection.mjs',
  'testMetadataRefresh.mjs',
  'testMetadataSearch.mjs',
  'testMusicAvailability.mjs',
  'testPlatformCatalog.mjs',
  'testPreserveLikes.mjs',
  'testScanWrites.mjs',
  'testSqlQueries.mjs',
  'testStartupRecovery.mjs',
  'testTrackRescan.mjs',
  'testVerifiedTagSaves.mjs'
]);
const mpv = new Set(['testMpvPlayback.mjs', 'testMpvAudioSamples.mjs', 'testMpvRenderer.cjs']);
const groups = { unit: [], catalog: [], ui: [], audio: [], mpv: [] };
for (const file of fs.readdirSync(path.join(root, 'scripts')).sort()) {
  if (!/^test.+\.(mjs|cjs)$/.test(file)) continue;
  const group = catalog.has(file)
    ? 'catalog'
    : mpv.has(file)
      ? 'mpv'
      : file === 'testGaplessRenderer.cjs'
        ? 'audio'
        : file.endsWith('.cjs')
          ? 'ui'
          : 'unit';
  groups[group].push(file);
}
for (const file of [...catalog, ...mpv]) {
  if (!fs.existsSync(path.join(root, 'scripts', file))) throw new Error(`Missing test: ${file}`);
}
const selections = { core: ['unit', 'catalog'], all: ['unit', 'catalog', 'ui'] };
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--list') {
  for (const [group, files] of Object.entries(groups)) {
    console.log(`\n${group} (${files.length} files)`);
    for (const file of files) console.log(`  ${file}`);
  }
  process.exit(0);
}
const selection = args[0] || 'core';
const selected = selections[selection] || (Object.hasOwn(groups, selection) ? [selection] : null);
if (!selected || args.length > 1) {
  console.error('Usage: node scripts/runTests.mjs [core|unit|catalog|ui|audio|mpv|all|--list]');
  process.exit(2);
}
const failures = [];
let passed = 0;
const started = Date.now();
for (const group of selected) {
  console.log(`\n=== ${group}: ${groups[group].length} test files ===`);
  for (const file of groups[group]) {
    console.log(`\n>>> ${file}`);
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const executable = group === 'catalog' ? require('electron') : process.execPath;
    if (group === 'catalog') env.ELECTRON_RUN_AS_NODE = '1';
    // Separate processes isolate module hooks, fake globals and native handles.
    // Each existing script owns its temporary fixtures and cleanup.
    const status = await new Promise((resolve) => {
      const child = spawn(executable, [path.join(root, 'scripts', file)], {
        cwd: root,
        env,
        stdio: 'inherit',
        windowsHide: true
      });
      child.on('error', (error) => {
        console.error(error.message);
        resolve(1);
      });
      child.on('close', (code, signal) => {
        if (signal) console.error(`${file} terminated by ${signal}`);
        resolve(code ?? 1);
      });
    });
    if (status === 0) passed++;
    else failures.push(`${group}/${file} (exit ${status})`);
  }
}
console.log(
  `\nTest files: ${passed} passed, ${failures.length} failed (${((Date.now() - started) / 1000).toFixed(1)}s).`
);
for (const failure of failures) console.error(`FAIL ${failure}`);
process.exitCode = failures.length ? 1 : 0;
