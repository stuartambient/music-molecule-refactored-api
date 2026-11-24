// Run with node scripts/testSqlQueries.mjs. Uses only an in-memory catalog.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import process from 'node:process';
import { createRequire, registerHooks } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
if (!process.versions.electron) {
  const result = spawnSync(require('electron'), [fileURLToPath(import.meta.url)], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit',
    windowsHide: true
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

const Database = require('better-sqlite3');
const db = new Database(':memory:');
globalThis.sqlQueryTestDb = db;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === './connection' && context.parentURL.endsWith('/sql.js')) {
      return {
        url: 'data:text/javascript,export default globalThis.sqlQueryTestDb',
        shortCircuit: true
      };
    }
    return next(specifier, context);
  }
});
const sql = await import('../src/main/sql.js');
hooks.deregister();
delete globalThis.sqlQueryTestDb;
after(() => db.close());
sql.initializeDatabase();
const reset = () => db.exec('DELETE FROM "audio-tracks"; DELETE FROM albums;');
const track = db.prepare(
  'INSERT INTO "audio-tracks" (track_id, audiotrack, birthtime) VALUES (?, ?, ?)'
);
const album = db.prepare('INSERT INTO albums (id, fullpath, birthtime, img) VALUES (?, ?, ?, ?)');
const ids = (rows, key = 'track_id') => rows.map((row) => row[key]);

test('album lookup respects directory boundaries, nested discs, separators, and case', () => {
  reset();
  for (const [id, path] of [
    ['one', 'C:/Music/Album/01.flac'],
    ['disc', 'C:/Music/Album/Disc 2/02.flac'],
    ['windows', 'C:\\Music\\Album\\03.flac'],
    ['sibling', 'C:/Music/Album Deluxe/01.flac'],
    ['prefix-file', 'C:/Music/Album.flac'],
    ['other', 'C:/Music/Other/01.flac']
  ])
    track.run(id, path, 1);
  for (const folder of ['C:/Music/Album', 'C:/Music/Album/', 'c:\\music\\album\\']) {
    assert.deepEqual(new Set(ids(sql.filesByAlbum(folder))), new Set(['one', 'disc', 'windows']));
  }
  assert.deepEqual(
    new Set(ids(sql.filesByAlbum(['C:/Music/Album', 'C:/Music/Other', 'C:/Music/Album/']))),
    new Set(['one', 'disc', 'windows', 'other'])
  );
  assert.deepEqual(sql.filesByAlbum([]), []);
  assert.deepEqual(sql.filesByAlbum(''), []);
});

test('percent, underscore, caret, and quotes in album paths are literal', () => {
  reset();
  const special = "C:/Music/100%_O'Neil^";
  track.run('literal', special + '/01.flac', 1);
  track.run('wildcard-lookalike', "C:/Music/100xyzXO'Neil^/01.flac", 1);
  track.run('caret-lookalike', "C:/Music/100%_O'Neil/01.flac", 1);
  track.run('sibling', special + ' Deluxe/01.flac', 1);
  assert.deepEqual(ids(sql.filesByAlbum(special)), ['literal']);
  assert.deepEqual(sql.filesByAlbum("C:/Music/' OR 1=1 --"), []);
});

test('drive roots and UNC folders retain their directory boundary', () => {
  reset();
  track.run('drive', 'D:/01.flac', 1);
  track.run('unc', '//server/share/Album/01.flac', 1);
  track.run('unc-windows', '\\\\server\\share\\Album\\02.flac', 1);
  track.run('unc-sibling', '//server/share/Album Deluxe/01.flac', 1);
  assert.deepEqual(ids(sql.filesByAlbum('D:/')), ['drive']);
  assert.deepEqual(
    new Set(ids(sql.filesByAlbum('\\\\server\\share\\Album\\'))),
    new Set(['unc', 'unc-windows'])
  );
});

test('search text treats SQL wildcard characters literally for Tracks, Albums and Covers', () => {
  reset();
  const paths = [
    'C:/100%/01.flac',
    'C:/100x/01.flac',
    'C:/Disc_1/01.flac',
    'C:/DiscX1/01.flac',
    'C:/a^b/01.flac'
  ];
  paths.forEach((path, i) => {
    track.run(String(i), path, i);
    album.run(String(i), path, i, null);
  });
  for (const [term, expected] of [
    ['%', ['0']],
    ['_', ['2']],
    ['^', ['4']],
    ["' OR 1=1 --", []]
  ]) {
    assert.deepEqual(ids(sql.allTracksBySearchTerm(0, term, 'ASC')), expected);
    assert.deepEqual(ids(sql.allAlbumsBySearchTerm(0, term, 'ASC'), 'id'), expected);
    assert.deepEqual(ids(sql.allCoversByScroll(0, 'ASC', term), 'id'), expected);
  }
});

test('mixed search words match in any order across folder boundaries and require every word', () => {
  reset();
  const entries = [
    ['wall', 'C:/Music/Pink Floyd/The Wall'],
    ['moon', 'C:/Music/Pink Floyd/Dark Side of the Moon'],
    ['other', 'C:/Music/Other Artist/Wall'],
    ['percent', 'C:/Music/Pink Floyd/The Wall/100%'],
    ['lookalike', 'C:/Music/Pink Floyd/The Wall/100x']
  ];
  entries.forEach(([id, folder]) => {
    track.run(id, folder + '/01.flac', 1);
    album.run(id, folder, 1, null);
  });
  const matching = ['lookalike', 'percent', 'wall'];
  for (const [term, expected] of [
    ['Floyd Wall', matching],
    ['Wall Floyd', matching],
    ['fLoYd wAlL', matching],
    ['  Floyd   Wall  ', matching],
    ['Wall\tFloyd\nWall', matching],
    ['Pink Wall', matching],
    ['Floyd Wall absent', []],
    ['Floyd Wall %', ['percent']],
    ['Floyd Moon', ['moon']],
    ['Other Wall', ['other']],
    ['   ', ['lookalike', 'moon', 'other', 'percent', 'wall']]
  ]) {
    assert.deepEqual(ids(sql.allTracksBySearchTerm(0, term, 'ASC')), expected, term);
    assert.deepEqual(ids(sql.allAlbumsBySearchTerm(0, term, 'ASC'), 'id'), expected, term);
    assert.deepEqual(ids(sql.allCoversByScroll(0, 'ASC', term), 'id'), expected, term);
  }
});

test('accented and unaccented mixed words match the reported album in every search', () => {
  reset();
  const name = 'Hélène Breschand & Elliott Sharp - Chansons du Crépuscule (2017)';
  const paths = [
    ['reported', 'C:/Music/' + name],
    ['decomposed', ('C:/Music/' + name).normalize('NFD')],
    ['partial', 'C:/Music/Hélène Breschand/Other Album'],
    ['other', 'C:/Music/Other Artist/Crépuscule']
  ];
  paths.forEach(([id, folder]) => {
    track.run(id, folder + '/01.flac', 1);
    album.run(id, folder, 1, null);
  });
  for (const term of [
    'helene crepuscule',
    'crepuscule helene',
    'HÉLÈNE CRÉPUSCULE',
    'Hélène Crépuscule'.normalize('NFD')
  ]) {
    const expected = ['decomposed', 'reported'];
    assert.deepEqual(ids(sql.allTracksBySearchTerm(0, term, 'ASC')), expected, term);
    assert.deepEqual(ids(sql.allAlbumsBySearchTerm(0, term, 'ASC'), 'id'), expected, term);
    assert.deepEqual(ids(sql.allCoversByScroll(0, 'ASC', term), 'id'), expected, term);
  }
  assert.equal(sql.allAlbumsBySearchTerm(0, 'helene absent', 'ASC').length, 0);
});

test('search folding does not change stored paths or literal album membership', () => {
  reset();
  track.run('accented', 'C:/Music/Hélène/01.flac', 1);
  track.run('plain', 'C:/Music/Helene/02.flac', 1);
  assert.deepEqual(ids(sql.allTracksBySearchTerm(0, 'helene', 'ASC')), ['accented', 'plain']);
  assert.deepEqual(ids(sql.filesByAlbum('C:/Music/Hélène')), ['accented']);
  assert.deepEqual(ids(sql.filesByAlbum('C:/Music/Helene')), ['plain']);
  assert.equal(sql.filesByAlbum('C:/Music/Hélène')[0].audiotrack, 'C:/Music/Hélène/01.flac');
});

test('all library pages use deterministic timestamp and ID ordering in both directions', () => {
  reset();
  const rows = [];
  db.transaction(() => {
    for (let i = 604; i >= 0; i--) {
      const id = `id-${String(i).padStart(4, '0')}`;
      const birth = i % 3 === 0 ? null : i % 3;
      rows.push({ id, birth, missing: i % 2 === 0 });
      track.run(id, `C:/Music/${id}/01.flac`, birth);
      album.run(id, `C:/Music/${id}`, birth, i % 2 === 0 ? null : 'cover');
    }
  })();
  const pageQueries = [
    [(page, order) => sql.allTracksByScroll(page, order), 'track_id', 200, false],
    [(page, order) => sql.allTracksBySearchTerm(page, 'id Music', order), 'track_id', 200, false],
    [(page, order) => sql.allAlbumsByScroll(page, order), 'id', 200, false],
    [(page, order) => sql.allAlbumsBySearchTerm(page, 'id Music', order), 'id', 200, false],
    [(page, order) => sql.allCoversByScroll(page, order, ''), 'id', 100, false],
    [(page, order) => sql.allCoversByScroll(page, order, 'id Music'), 'id', 100, false],
    [(page, order) => sql.allMissingCoversByScroll(page, order), 'id', 100, true]
  ];
  for (const order of ['ASC', 'DESC']) {
    const sorted = [...rows].sort(
      (a, b) => (a.birth ?? -1) - (b.birth ?? -1) || a.id.localeCompare(b.id)
    );
    if (order === 'DESC') sorted.reverse();
    for (const [query, key, size, missing] of pageQueries) {
      const expected = sorted.filter((row) => !missing || row.missing).map((row) => row.id);
      const actual = [];
      for (let page = 0; page <= Math.ceil(expected.length / size); page++)
        actual.push(...ids(query(page, order), key));
      assert.deepEqual(actual, expected);
      assert.equal(new Set(actual).size, actual.length);
    }
  }
});

test('sort tokens are normalized inside every query and offsets are bound and validated', () => {
  reset();
  for (const id of ['a', 'b']) {
    track.run(id, `Music/${id}`, 1);
    album.run(id, `Music/${id}`, 1, null);
  }
  const queries = [
    (page, sort) => sql.allTracksByScroll(page, sort),
    (page, sort) => sql.allTracksBySearchTerm(page, 'Music', sort),
    (page, sort) => sql.allAlbumsByScroll(page, sort),
    (page, sort) => sql.allAlbumsBySearchTerm(page, 'Music', sort),
    (page, sort) => sql.allCoversByScroll(page, sort),
    (page, sort) => sql.allCoversByScroll(page, sort, 'Music'),
    (page, sort) => sql.allMissingCoversByScroll(page, sort)
  ];
  for (const query of queries) {
    const expected = query(0, 'DESC');
    for (const sort of [undefined, 'asc', 'ASC; DROP TABLE albums; --', 'DESC, random()'])
      assert.deepEqual(query(0, sort), expected);
    for (const page of [-1, 0.5, '0; DROP TABLE albums', Number.MAX_SAFE_INTEGER])
      assert.throws(() => query(page, 'ASC'), RangeError);
  }
  assert.equal(db.prepare('SELECT count(*) AS count FROM albums').get().count, 2);
});

test('initialization preserves existing rows and installs non-unique paging indexes idempotently', () => {
  reset();
  track.run('first', 'same-path', 1);
  track.run('second', 'same-path', 1);
  album.run('first', 'same-folder', 1, null);
  album.run('second', 'same-folder', 1, null);
  sql.initializeDatabase();
  sql.initializeDatabase();
  assert.equal(sql.allTracksByScroll(0, 'ASC').length, 2);
  assert.equal(sql.allAlbumsByScroll(0, 'ASC').length, 2);
  for (const [table, name] of [
    ['audio-tracks', 'idx_audio_tracks_birthtime_id'],
    ['albums', 'idx_albums_birthtime_id'],
    ['albums', 'idx_albums_missing_cover_birthtime_id']
  ]) {
    const index = db
      .prepare(`PRAGMA index_list('${table}')`)
      .all()
      .find((row) => row.name === name);
    assert(index);
    assert.equal(index.unique, 0);
  }
  for (const [query, index] of [
    [
      'SELECT * FROM "audio-tracks" ORDER BY birthtime DESC, track_id DESC, rowid DESC LIMIT 200',
      'idx_audio_tracks_birthtime_id'
    ],
    [
      'SELECT * FROM albums ORDER BY birthtime ASC, id ASC, rowid ASC LIMIT 200',
      'idx_albums_birthtime_id'
    ],
    [
      'SELECT * FROM albums WHERE img IS NULL ORDER BY birthtime DESC, id DESC, rowid DESC LIMIT 100',
      'idx_albums_missing_cover_birthtime_id'
    ]
  ]) {
    const plan = db
      .prepare('EXPLAIN QUERY PLAN ' + query)
      .all()
      .map((row) => row.detail)
      .join('\n');
    assert(plan.includes(index), plan);
    assert(!plan.includes('USE TEMP B-TREE'), plan);
  }
});

test('legacy null IDs have a rowid tie-breaker without forcing identity migrations', () => {
  reset();
  for (const path of ['first', 'second', 'third']) {
    track.run(null, path, 1);
    album.run(null, path, 1, null);
  }
  assert.deepEqual(
    sql.allTracksByScroll(0, 'ASC').map((row) => row.audiotrack),
    ['first', 'second', 'third']
  );
  assert.deepEqual(
    sql.allAlbumsByScroll(0, 'DESC').map((row) => row.fullpath),
    ['third', 'second', 'first']
  );
});

test('root replacement is atomic and rolls back deletions when an insertion fails', () => {
  db.exec('DELETE FROM roots');
  sql.updateRoots(['C:/Keep', 'D:/Existing']);
  db.exec(`CREATE TRIGGER reject_root BEFORE INSERT ON roots
    WHEN NEW.root = 'E:/Reject' BEGIN SELECT RAISE(ABORT, 'root rejected'); END;`);
  try {
    assert.throws(() => sql.updateRoots(['C:/Keep', 'F:/New', 'E:/Reject']), /root rejected/);
    assert.deepEqual(sql.getRoots().sort(), ['C:/Keep', 'D:/Existing']);
  } finally {
    db.exec('DROP TRIGGER reject_root');
  }
  assert.deepEqual(sql.updateRoots(['C:/Keep', 'F:/New']), [{ Deleted: 1 }, { Inserted: 1 }]);
  assert.deepEqual(sql.getRoots().sort(), ['C:/Keep', 'F:/New']);
  assert.deepEqual(sql.updateRoots([]), [{ Deleted: 2 }]);
  assert.deepEqual(sql.getRoots(), []);
});
