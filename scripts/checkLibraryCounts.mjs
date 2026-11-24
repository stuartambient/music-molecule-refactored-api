// Read-only totals check using the same cursor queries as the app. No ID sets are collected.
// node scripts/checkLibraryCounts.mjs [--db=path/to/music.db]
import assert from 'node:assert/strict';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { readLibraryPage } from '../src/main/libraryPages.js';
import { loadEnv } from 'vite';
const require = createRequire(import.meta.url);
if (!process.versions.electron) {
  const result = spawnSync(
    require('electron'),
    [fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: 'inherit',
      windowsHide: true
    }
  );
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
const Database = require('better-sqlite3');
const configured = loadEnv('development', process.cwd(), 'MAIN_VITE_').MAIN_VITE_DB_PATH_DEV;
const filename = path.resolve(
  process.argv.find((arg) => arg.startsWith('--db='))?.slice(5) || configured || 'src/db/music.db'
);
const db = new Database(filename, { readonly: true, fileMustExist: true });
try {
  db.pragma('query_only = ON');
  console.log('Read-only catalog: ' + filename);
  // Hold one read snapshot so a simultaneous scan cannot change the expected total midway.
  db.transaction(() => {
    for (const [kind, table, pageSize] of [
      ['tracks', '"audio-tracks"', 200],
      ['albums', 'albums', 200]
    ]) {
      const expected = db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total;
      console.log(`Database ${kind}: ${expected.toLocaleString()}`);
      for (const sort of ['ASC', 'DESC']) {
        let cursor = null,
          returned = 0,
          requests = 0;
        const started = performance.now();
        do {
          const page = readLibraryPage(db, { kind, cursor, sort });
          returned += page.items.length;
          requests++;
          assert(
            requests <= Math.ceil(expected / pageSize) + 1,
            'Paging exceeded the expected number of requests'
          );
          assert(returned <= expected, 'Paged total exceeded the database count');
          if (page.nextCursor)
            assert.notDeepEqual(page.nextCursor, cursor, 'Cursor did not advance');
          cursor = page.nextCursor;
        } while (cursor);
        const status = returned === expected ? 'PASS' : 'FAIL';
        console.log(
          `${status} ${kind} ${sort}: database=${expected.toLocaleString()}, paged=${returned.toLocaleString()}, difference=${returned - expected}, pages=${requests}, seconds=${((performance.now() - started) / 1000).toFixed(2)}`
        );
        assert.equal(returned, expected, `${kind} ${sort}: paged total differs from COUNT(*)`);
      }
    }
  })();
  console.log(
    'Totals match in both directions. Counts alone cannot detect a missing row offset by a repeated row.'
  );
} finally {
  db.close();
}
