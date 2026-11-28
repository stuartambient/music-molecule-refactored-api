import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { albumTracksQuery, albumDirectoryRanges } from '../src/main/catalogPaths.js';
import { registerLibrarySearch } from '../src/main/librarySearch.js';

test('Linux album membership is indexed, case-sensitive and preserves literal backslashes', (t) => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(
    `CREATE TABLE "audio-tracks" (audiotrack, genres); CREATE INDEX paths_binary ON "audio-tracks"(audiotrack COLLATE BINARY);`
  );
  registerLibrarySearch(db);
  const files = [
    '/music/Album/01.flac',
    '/music/Album/Disc 2/02.flac',
    '/music/album/03.flac',
    '/music/Album Extra/04.flac',
    '/music/A_100%/05.flac',
    '/music/AX100percent/06.flac',
    '/music/Album\\Name/07.flac'
  ];
  for (const file of files)
    db.prepare('INSERT INTO "audio-tracks" VALUES (?, ?)').run(file, 'Progressive Rock');
  const query = albumTracksQuery('/music/Album', 'linux');
  assert.deepEqual(
    db
      .prepare(query.sql)
      .all(...query.params)
      .map((row) => row.audiotrack),
    files.slice(0, 2)
  );
  const literal = albumTracksQuery('/music/A_100%', 'linux');
  assert.deepEqual(
    db
      .prepare(literal.sql)
      .all(...literal.params)
      .map((row) => row.audiotrack),
    [files[4]]
  );
  const backslash = albumTracksQuery('/music/Album\\Name', 'linux');
  assert.deepEqual(
    db
      .prepare(backslash.sql)
      .all(...backslash.params)
      .map((row) => row.audiotrack),
    [files[6]]
  );
  const membership = albumDirectoryRanges('audiotrack', '@folder', 'linux');
  const sql = `SELECT * FROM "audio-tracks" WHERE ${membership} AND library_search(genres, @term)`;
  assert.equal(db.prepare(sql).all({ folder: '/music/Album', term: 'rock prog' }).length, 2);
  assert.ok(
    db
      .prepare('EXPLAIN QUERY PLAN ' + sql)
      .all({ folder: '/music/Album', term: 'rock' })
      .some((row) => row.detail.includes('USING INDEX paths_binary'))
  );
});

test('Windows album membership retains case-insensitive slash/backslash matching without sibling matches', (t) => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(
    'CREATE TABLE "audio-tracks" (audiotrack); CREATE INDEX paths_nocase ON "audio-tracks"(audiotrack COLLATE NOCASE)'
  );
  for (const file of [
    'I:/Music/Album/01.flac',
    'i:\\music\\album\\Disc\\02.flac',
    'I:/Music/Album Other/03.flac'
  ])
    db.prepare('INSERT INTO "audio-tracks" VALUES (?)').run(file);
  const query = albumTracksQuery('I:/MUSIC/Album', 'win32');
  assert.equal(db.prepare(query.sql).all(...query.params).length, 2);
  const none = albumTracksQuery([], 'linux');
  assert.deepEqual(db.prepare(none.sql).all(...none.params), []);
});
