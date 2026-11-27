import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { registerLibrarySearch } from '../src/main/librarySearch.js';
import { validateIpcArguments } from '../src/main/ipcValidation.js';
import { readLibraryPage, libraryPageQuery } from '../src/main/libraryPages.js';

function fixture(t) {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE "audio-tracks" (track_id, birthtime, audiotrack, like, performers, title, album, albumArtists, genres);
    CREATE TABLE albums (id, birthtime, fullpath, foldername, img);
    CREATE INDEX tracks_date ON "audio-tracks"(birthtime, track_id);
    CREATE INDEX albums_date ON albums(birthtime, id);
    CREATE INDEX idx_audio_tracks_audiotrack ON "audio-tracks"(audiotrack COLLATE NOCASE);`);
  registerLibrarySearch(db);
  let serial = 0;
  const album = (folder, options = {}) => {
    const id = `album-${++serial}`;
    db.prepare('INSERT INTO albums VALUES (?, ?, ?, ?, ?)').run(
      id,
      options.time ?? '2026-01-01',
      folder,
      options.name ?? folder.split('/').at(-1),
      options.image ?? null
    );
    return id;
  };
  const track = (file, metadata = {}) => {
    const id = metadata.id === undefined ? `track-${++serial}` : metadata.id;
    db.prepare('INSERT INTO "audio-tracks" VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)').run(
      id,
      metadata.time === undefined ? '2026-01-01' : metadata.time,
      file,
      metadata.artist ?? null,
      metadata.title ?? null,
      metadata.album ?? null,
      metadata.albumArtist ?? null,
      metadata.genre ?? null
    );
    return id;
  };
  const search = (kind, term, options = {}) =>
    readLibraryPage(db, { kind, term, ...options }).items;
  return { db, album, track, search };
}

test('tracks match title, artist, album artist and album absent from filenames', (t) => {
  const f = fixture(t);
  const id = f.track('I:/Music/Folder/01.flac', {
    title: 'Quiet Horizon',
    artist: 'Hidden Performer',
    albumArtist: 'Secret Ensemble',
    album: 'Unusual Collection'
  });
  for (const term of [
    'horizon',
    'hidden',
    'secret',
    'unusual',
    'performer horizon',
    'ensemble collection'
  ])
    assert.deepEqual(
      f.search('tracks', term).map((row) => row.track_id),
      [id]
    );
  assert.equal(f.search('tracks', 'not-present').length, 0);
});

test('mixed words, accents, case, repeated terms and path fallback retain their behavior', (t) => {
  const f = fixture(t);
  f.track('I:/Music/Folder Name/01.flac', {
    title: 'Déjà Vu',
    artist: 'Björk',
    album: 'Hidden Album'
  });
  for (const term of [
    'BJORK DEJA',
    'album folder vu',
    'vu bjork vu',
    '01.flac',
    'folder name',
    '   '
  ])
    assert.equal(f.search('tracks', term).length, 1, term);
  f.track('I:/Music/NoTags/02.flac');
  assert.equal(f.search('tracks', 'notags').length, 1);
  assert.equal(f.search('tracks', "' OR 1=1 --").length, 0);
});

test('Albums and Covers ignore contained track titles, artists, album artists and album tags', (t) => {
  const f = fixture(t);
  const id = f.album('I:/Music/Folder Name');
  f.track('I:/Music/Folder Name/Disc 2/01.flac', {
    title: 'Invisible Song',
    artist: 'Metadata Artist',
    albumArtist: 'Different Ensemble',
    album: 'Secret Collection'
  });
  for (const kind of ['albums', 'covers']) {
    for (const term of [
      'invisible',
      'metadata artist',
      'different ensemble',
      'secret collection',
      '01.flac'
    ])
      assert.equal(f.search(kind, term).length, 0, kind + ': ' + term);
    assert.deepEqual(
      f.search(kind, 'folder name').map((row) => row.id),
      [id]
    );
  }
});

test('Albums and Covers retain accent-insensitive mixed-word path search', (t) => {
  const f = fixture(t);
  const id = f.album('I:/Music/Hélène - Quiet Hours');
  for (const kind of ['albums', 'covers'])
    assert.deepEqual(
      f.search(kind, 'HOURS helene').map((row) => row.id),
      [id]
    );
});

test('missing-cover filtering remains combined with folder/path search', (t) => {
  const f = fixture(t);
  const missing = f.album('I:/Music/Shared Missing');
  f.album('I:/Music/Shared Present', { image: 'cover.jpg' });
  assert.deepEqual(
    f.search('covers', 'shared', { missing: true }).map((row) => row.id),
    [missing]
  );
});

test('metadata changes are visible immediately to subsequent queries without rebuilding an index', (t) => {
  const f = fixture(t);
  const folder = 'I:/Music/Updates';
  f.album(folder);
  const id = f.track(folder + '/01.flac', { title: 'Before' });
  assert.equal(f.search('albums', 'after').length, 0);
  f.db.prepare('UPDATE "audio-tracks" SET title = ? WHERE track_id = ?').run('After', id);
  assert.equal(f.search('tracks', 'after').length, 1);
  assert.equal(f.search('tracks', 'before').length, 0);
  for (const kind of ['albums', 'covers']) assert.equal(f.search(kind, 'after').length, 0);
});

test('all search pages agree with a complete expected set in both sort directions', (t) => {
  const f = fixture(t);
  for (let i = 0; i < 437; i++) {
    const folder = `I:/Music/Folder-${i}`;
    f.album(folder, { time: i % 4 ? '2026-01-01' : '2026-01-02' });
    f.track(folder + '/01.flac', {
      id: i % 13 ? 'id-' + i : null,
      time: i % 17 ? '2026-01-01' : null,
      artist: 'Needle Artist'
    });
  }
  for (const kind of ['tracks', 'albums', 'covers'])
    for (const sort of ['ASC', 'DESC']) {
      let cursor = null;
      const returned = [];
      do {
        const page = readLibraryPage(f.db, {
          kind,
          term: kind === 'tracks' ? 'needle artist' : 'folder',
          sort,
          cursor
        });
        returned.push(
          ...page.items.map((row) => (kind === 'tracks' ? row.audiotrack : row.fullpath))
        );
        cursor = page.nextCursor;
      } while (cursor);
      assert.equal(returned.length, 437, kind + ' ' + sort);
      assert.equal(new Set(returned).size, 437);
      const table = kind === 'tracks' ? '"audio-tracks"' : 'albums';
      const id = kind === 'tracks' ? 'track_id' : 'id';
      const column = kind === 'tracks' ? 'audiotrack' : 'fullpath';
      const expected = f.db
        .prepare(
          `SELECT ${column} AS path FROM ${table} ORDER BY birthtime ${sort}, ${id} ${sort}, rowid ${sort}`
        )
        .all()
        .map((row) => row.path);
      assert.deepEqual(returned, expected, kind + ' ' + sort + ' ordering');
    }
  const first = readLibraryPage(f.db, { kind: 'tracks', term: 'needle', sort: 'DESC' });
  assert.throws(
    () =>
      readLibraryPage(f.db, {
        kind: 'tracks',
        term: 'other',
        sort: 'DESC',
        cursor: first.nextCursor
      }),
    /another query/
  );
});

test('Albums and Covers searches do not consult the track catalog', (t) => {
  const f = fixture(t);
  const id = f.album('I:/Music/Example Album');
  f.db.exec('DROP TABLE "audio-tracks"');
  for (const kind of ['albums', 'covers'])
    assert.deepEqual(
      f.search(kind, 'example album').map((row) => row.id),
      [id]
    );
});

test('genre is explicitly selected and matches partial words across genre values in any order', (t) => {
  const f = fixture(t);
  const id = f.track('I:/Music/Plain/01.flac', { genre: 'Progressive Rock; Psychedelic Folk' });
  f.track('I:/Music/Rock/02.flac', { title: 'Progressive Rock Anthem', genre: 'Jazz' });
  f.track('I:/Music/Plain/03.flac', { genre: '' });
  f.track('I:/Music/Plain/04.flac');
  for (const term of ['prog rock', 'rock prog', 'psy folk', 'rock folk'])
    assert.deepEqual(
      f.search('tracks', term, { searchField: 'genre' }).map((row) => row.track_id),
      [id]
    );
  assert.ok(!f.search('tracks', 'psy folk').some((row) => row.track_id === id));
  assert.equal(f.search('tracks', 'genre-not-present', { searchField: 'genre' }).length, 0);
  const accented = f.track('I:/Music/Plain/05.flac', { genre: 'Électronique; Expérimental' });
  assert.deepEqual(
    f.search('tracks', 'elec experi', { searchField: 'genre' }).map((row) => row.track_id),
    [accented]
  );
  assert.equal(f.search('tracks', '', { searchField: 'genre' }).length, 5);
});

test('genre pagination retains complete unique results and cannot reuse another search mode cursor', (t) => {
  const f = fixture(t);
  for (let i = 0; i < 437; i++)
    f.track(`I:/Music/Plain/${i}.flac`, { title: 'Progressive Rock', genre: 'Progressive Rock' });
  for (const sort of ['ASC', 'DESC']) {
    let cursor = null;
    const ids = [];
    do {
      const page = readLibraryPage(f.db, {
        kind: 'tracks',
        term: 'prog rock',
        searchField: 'genre',
        sort,
        cursor
      });
      ids.push(...page.items.map((row) => row.track_id));
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(ids.length, 437);
    assert.equal(new Set(ids).size, 437);
  }
  const first = readLibraryPage(f.db, { kind: 'tracks', term: 'prog rock', searchField: 'genre' });
  assert.throws(
    () => readLibraryPage(f.db, { kind: 'tracks', term: 'prog rock', cursor: first.nextCursor }),
    /another query/
  );
});

test('search mode IPC allows only the two supported track modes', () => {
  for (const field of ['metadata', 'genre'])
    validateIpcArguments('get-tracks', [null, 'rock', 'DESC', field], 'main');
  validateIpcArguments('get-tracks', [null, 'rock', 'DESC'], 'main');
  assert.throws(() => validateIpcArguments('get-tracks', [null, 'rock', 'DESC', 'lyrics'], 'main'));
  assert.throws(() =>
    validateIpcArguments(
      'get-tracks',
      [null, 'rock', 'DESC', 'genres); DROP TABLE albums;'],
      'main'
    )
  );
});

test('Covers genre search matches contained track genres only and returns each album once', (t) => {
  const f = fixture(t);
  const folder = 'I:/Music/Neutral';
  const id = f.album(folder);
  f.track(folder + '/Disc 1/01.flac', { genre: 'Progressive Rock; Folk' });
  f.track(folder + '/Disc 2/02.flac', { genre: 'Progressive Rock' });
  f.album('I:/Music/Progressive Rock');
  f.track('I:/Music/Progressive Rock/01.flac', { genre: 'Jazz', title: 'Progressive Rock' });
  f.album('I:/Music/Blank');
  f.track('I:/Music/Blank/01.flac');
  assert.deepEqual(
    f.search('covers', 'rock prog', { searchField: 'genre' }).map((row) => row.id),
    [id]
  );
  assert.ok(!f.search('covers', 'rock prog').some((row) => row.id === id));
  assert.throws(() => f.search('albums', 'rock', { searchField: 'genre' }), /Invalid search field/);
});

test('Covers genre matching respects album boundaries, literal wildcards, backslashes and missing-cover filter', (t) => {
  const f = fixture(t);
  const folder = 'I:/Music/A_100%';
  const id = f.album(folder);
  f.album(folder + ' Extra', { image: 'cover.jpg' });
  f.track(folder + '/01.flac', { genre: 'Électronique' });
  f.track(folder + ' Extra/01.flac', { genre: 'Jazz' });
  assert.deepEqual(
    f.search('covers', 'elec', { searchField: 'genre', missing: true }).map((row) => row.id),
    [id]
  );
  assert.equal(f.search('covers', 'jazz', { searchField: 'genre', missing: true }).length, 0);
  const legacy = f.album('I:\\Music\\Legacy');
  f.track('i:\\music\\legacy\\Disc 1\\01.flac', { genre: 'Ambient Electronic' });
  assert.deepEqual(
    f.search('covers', 'elec ambi', { searchField: 'genre' }).map((row) => row.id),
    [legacy]
  );
});

test('Covers genre pages remain unique in both directions and folder cursors cannot be reused', (t) => {
  const f = fixture(t);
  for (let i = 0; i < 237; i++) {
    const folder = 'I:/Music/Album-' + i;
    f.album(folder);
    f.track(folder + '/01.flac', { genre: 'Progressive Rock' });
  }
  for (const sort of ['ASC', 'DESC']) {
    let cursor = null;
    const ids = [];
    do {
      const page = readLibraryPage(f.db, {
        kind: 'covers',
        term: 'prog rock',
        sort,
        searchField: 'genre',
        cursor
      });
      ids.push(...page.items.map((row) => row.id));
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(ids.length, 237);
    assert.equal(new Set(ids).size, 237);
  }
  const first = readLibraryPage(f.db, { kind: 'covers', term: 'prog rock', searchField: 'genre' });
  assert.throws(
    () => readLibraryPage(f.db, { kind: 'covers', term: 'prog rock', cursor: first.nextCursor }),
    /another query/
  );
  validateIpcArguments('get-covers', [null, 'rock', 'DESC', 'missing-covers', 'genre'], 'main');
  validateIpcArguments('get-covers', [null, 'rock', 'DESC', 'not-requested'], 'main');
  assert.throws(() =>
    validateIpcArguments('get-covers', [null, 'rock', 'DESC', 'missing-covers', 'title'], 'main')
  );
});

test('Covers genre query uses indexed directory ranges rather than rescanning the track table per album', (t) => {
  const f = fixture(t);
  f.album('I:/Music/Example');
  const query = libraryPageQuery({ kind: 'covers', term: 'rock', searchField: 'genre' });
  const plan = f.db
    .prepare('EXPLAIN QUERY PLAN ' + query.sql)
    .all(query.params)
    .map((row) => row.detail);
  assert.ok(
    plan.some((line) =>
      line.includes('SEARCH genre_track USING INDEX idx_audio_tracks_audiotrack')
    ),
    plan.join('\n')
  );
  assert.ok(!plan.some((line) => line.includes('SCAN genre_track')), plan.join('\n'));
});
