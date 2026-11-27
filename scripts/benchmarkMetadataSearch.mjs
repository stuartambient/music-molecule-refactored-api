// Disposable synthetic catalog; no user database or music files are accessed.
import fs from 'node:fs';
import console from 'node:console';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { readLibraryPage, libraryPageQuery } from '../src/main/libraryPages.js';
import { registerLibrarySearch } from '../src/main/librarySearch.js';
const require = createRequire(import.meta.url);
if (!process.versions.electron) {
  const result = spawnSync(
    require('electron'),
    [fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit', windowsHide: true }
  );
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
const Database = require('better-sqlite3');
const size = Number(process.argv.find((arg) => arg.startsWith('--tracks='))?.slice(9) || 500000);
if (!Number.isInteger(size) || size < 1000 || size > 2000000)
  throw new Error('Invalid track count');
const albums = Math.ceil(size / 12.35);
const genreOnly = process.argv.includes('--genre-only');
const output = process.argv.find((arg) => arg.startsWith('--output='))?.slice(9);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'music-metadata-search-'));
assert.equal(path.dirname(temporary), os.tmpdir());
assert.ok(path.basename(temporary).startsWith('music-metadata-search-'));
const db = new Database(path.join(temporary, 'catalog.db'));
const measure = (operation) => {
  operation();
  const samples = [];
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    operation();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return { medianMs: +samples[1].toFixed(2), maxMs: +samples[2].toFixed(2), samples: 3 };
};
try {
  db.pragma('journal_mode = WAL');
  db.pragma('cache_size = -32768');
  db.exec(`CREATE TABLE "audio-tracks" (track_id, birthtime, audiotrack, like, performers, title, album, albumArtists, genres, padding);
    CREATE TABLE albums (id, birthtime, fullpath, foldername, img);
    CREATE INDEX tracks_date ON "audio-tracks"(birthtime, track_id);
    CREATE INDEX albums_date ON albums(birthtime, id);
    CREATE INDEX idx_audio_tracks_audiotrack ON "audio-tracks"(audiotrack COLLATE NOCASE);`);
  registerLibrarySearch(db);
  const insertTrack = db.prepare(
    'INSERT INTO "audio-tracks" VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?)'
  );
  const insertAlbum = db.prepare('INSERT INTO albums VALUES (?, ?, ?, ?, ?)');
  console.log(`Populating ${size} tracks / ${albums} albums...`);
  db.transaction(() => {
    let previous = -1;
    for (let i = 0; i < size; i++) {
      const group = Math.floor((i * albums) / size);
      const folder = `C:/Synthetic/Folder-${String(group).padStart(8, '0')}`;
      const birth = new Date(1700000000000 + group * 1000).toISOString();
      if (group !== previous) {
        insertAlbum.run(
          String(group),
          birth,
          folder,
          'Folder-' + group,
          group % 3 ? 'cover.jpg' : null
        );
        previous = group;
      }
      insertTrack.run(
        String(i),
        birth,
        `${folder}/${i}.flac`,
        group % 1000 ? 'Performer ' + (group % 997) : 'Hélène',
        'Hidden Title ' + (i % 17),
        'Collection ' + group,
        'Ensemble ' + (group % 751),
        group % 5 === 0
          ? null
          : group % 5 === 1
            ? ''
            : group % 2
              ? 'Progressive Rock; Psychedelic Folk'
              : 'Ambient; Electronic',
        'm'.repeat(256)
      );
    }
  })();
  const report = {
    generatedAt: new Date().toISOString(),
    tracks: size,
    albums,
    runtime: {
      electron: process.versions.electron,
      node: process.versions.node,
      sqlite: db.prepare('SELECT sqlite_version() AS v').get().v
    },
    platform: os.platform() + ' ' + os.release(),
    cpu: os.cpus()[0]?.model,
    methodology:
      'On-disk temporary WAL catalog, 32 MiB cache, about 12.35 tracks per album, numeric filenames/folders, metadata absent from paths, 256 padding bytes per track. Warm-up plus three samples. Measures SQL and JS materialization, not IPC/rendering or cold disk. Only Tracks uses tag metadata; Albums and Covers retain path-only search. Dates remain the selected sort order; no persistent text index or relevance ranking.',
    searches: {},
    pathOnlyBaseline: {}
  };
  const noMatch = 'not-in-this-catalog';
  const baseline = db.prepare(
    'SELECT track_id FROM "audio-tracks" WHERE library_search(audiotrack, ?) ORDER BY birthtime DESC, track_id DESC, rowid DESC LIMIT 201'
  );
  report.pathOnlyBaseline = measure(() => baseline.all(noMatch));
  console.log('Path-only no-match baseline:', report.pathOnlyBaseline.medianMs, 'ms');
  for (const kind of genreOnly ? [] : ['tracks', 'albums', 'covers']) {
    report.searches[kind] = {};
    for (const term of ['hidden title 9', 'ensemble 42', 'helene', 'folder-000000', noMatch]) {
      report.searches[kind][term] = measure(() => readLibraryPage(db, { kind, term }));
      console.log(kind, term, report.searches[kind][term].medianMs, 'ms');
    }
  }
  if (genreOnly) {
    report.genreSearches = {};
    for (const term of ['prog rock', 'rock prog', 'ambi elec', 'not-in-the-genre-tags']) {
      report.genreSearches[term] = measure(() =>
        readLibraryPage(db, { kind: 'tracks', term, searchField: 'genre' })
      );
      console.log('genre', term, report.genreSearches[term].medianMs, 'ms');
    }
    report.coverGenreSearches = {};
    for (const term of ['prog rock', 'rock prog', 'ambi elec', 'not-in-the-genre-tags']) {
      report.coverGenreSearches[term] = measure(() =>
        readLibraryPage(db, { kind: 'covers', term, searchField: 'genre' })
      );
      console.log('cover genre', term, report.coverGenreSearches[term].medianMs, 'ms');
    }
    const genreQuery = libraryPageQuery({
      kind: 'covers',
      term: 'not-in-the-genre-tags',
      searchField: 'genre'
    });
    report.coverGenrePlan = db
      .prepare('EXPLAIN QUERY PLAN ' + genreQuery.sql)
      .all(genreQuery.params)
      .map((row) => row.detail);
    report.genreMethodology =
      'Explicit genre-only mode; synthetic genre values include NULL, empty, Progressive Rock; Psychedelic Folk, and Ambient; Electronic. Ordinary metadata/path searches exclude genre tags.';
  }
  const query = libraryPageQuery({ kind: 'albums', term: noMatch });
  report.albumPlan = db
    .prepare('EXPLAIN QUERY PLAN ' + query.sql)
    .all(query.params)
    .map((row) => row.detail);
  if (output) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  } else console.log(JSON.stringify(report, null, 2));
} finally {
  db.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
