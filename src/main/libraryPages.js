import { isLibraryCursor } from '../shared/libraryCursor.js';

const definitions = {
  tracks: {
    table: '"audio-tracks"',
    id: 'track_id',
    path: 'audiotrack',
    size: 200,
    fields: 'track_id, like, audiotrack, performers, title, album'
  },
  albums: { table: 'albums', id: 'id', path: 'fullpath', size: 200, fields: '*' },
  covers: {
    table: 'albums',
    id: 'id',
    path: 'fullpath',
    size: 100,
    fields: 'id, foldername, fullpath, img'
  }
};
// Combine fields before normalization so query words can span path, artist and title.
const trackSearchText = ['audiotrack', 'title', 'performers', 'albumArtists', 'album']
  .map((column) => `COALESCE(${column}, '')`)
  .join(' || char(10) || ');

function coverGenreFilter() {
  const directory = "rtrim(replace(albums.fullpath, char(92), '/'), '/')";
  const windowsDirectory = `replace(${directory}, '/', char(92))`;
  // Bound directory ranges use the existing non-unique path index, including disc subfolders.
  return `EXISTS (SELECT 1 FROM "audio-tracks" AS genre_track WHERE
    ((genre_track.audiotrack COLLATE NOCASE >= ${directory} || '/'
      AND genre_track.audiotrack COLLATE NOCASE < ${directory} || '0')
    OR (genre_track.audiotrack COLLATE NOCASE >= ${windowsDirectory} || char(92)
      AND genre_track.audiotrack COLLATE NOCASE < ${windowsDirectory} || ']'))
    AND library_search(genre_track.genres, @term))`;
}

const statements = new WeakMap();

export function libraryPageQuery({
  kind,
  cursor = null,
  sort = 'DESC',
  term = '',
  missing = false,
  searchField = 'metadata'
}) {
  const definition = definitions[kind];
  if (!definition || !isLibraryCursor(cursor)) throw new RangeError('Invalid library cursor.');
  if (
    !['metadata', 'genre'].includes(searchField) ||
    (kind === 'albums' && searchField !== 'metadata')
  )
    throw new RangeError('Invalid search field.');
  const order = sort === 'ASC' ? 'ASC' : 'DESC';
  const scope = JSON.stringify([
    kind,
    order,
    term,
    missing,
    ...(searchField === 'genre' ? ['genre'] : [])
  ]);
  if (cursor && cursor.scope !== scope)
    throw new RangeError('Library cursor belongs to another query.');
  const params = { limit: definition.size + 1 };
  const filters = [];
  if (term) {
    filters.push(
      kind === 'tracks'
        ? `library_search(${searchField === 'genre' ? 'genres' : trackSearchText}, @term)`
        : searchField === 'genre'
          ? coverGenreFilter()
          : `library_search(${definition.path}, @term)`
    );
    params.term = term;
  }
  if (missing) filters.push('img IS NULL');
  const columns = ['birthtime', definition.id, 'rowid'];
  const select = `SELECT ${definition.fields}, birthtime AS _pageTime, ${definition.id} AS _pageId, rowid AS _pageRow FROM ${definition.table}`;
  const queries = [];
  const add = (conditions) =>
    queries.push(select + (conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''));
  if (!cursor) add(filters);
  else {
    // Separate indexed ranges let SQLite merge the ordered branches without OFFSET.
    // Explicit NULL ranges retain the catalog's existing SQLite ordering, including legacy IDs.
    const equal = [];
    for (let index = 0; index < columns.length; index++) {
      const column = columns[index],
        value = cursor.key[index],
        parameter = `key${index}`;
      params[parameter] = value;
      if (value !== null) {
        add([...filters, ...equal, `${column} ${order === 'ASC' ? '>' : '<'} @${parameter}`]);
        if (order === 'DESC' && index < 2) add([...filters, ...equal, `${column} IS NULL`]);
      } else if (order === 'ASC') add([...filters, ...equal, `${column} IS NOT NULL`]);
      equal.push(`${column} IS @${parameter}`);
    }
  }
  // Some cursor branches do not use every key; named bindings may include those unused keys.
  const sql =
    queries.join(' UNION ALL ') +
    ` ORDER BY _pageTime ${order}, _pageId ${order}, _pageRow ${order} LIMIT @limit`;
  return { sql, params, scope, size: definition.size };
}

export function readLibraryPage(db, options) {
  const { sql, params, scope, size } = libraryPageQuery(options);
  let cache = statements.get(db);
  if (!cache) {
    cache = new Map();
    statements.set(db, cache);
  }
  let statement = cache.get(sql);
  if (!statement) {
    statement = db.prepare(sql);
    if (cache.size >= 64) cache.clear();
    cache.set(sql, statement);
  }
  const rows = statement.all(params);
  const hasMore = rows.length > size;
  const selected = rows.slice(0, size);
  const last = selected.at(-1);
  const nextCursor = hasMore ? { scope, key: [last._pageTime, last._pageId, last._pageRow] } : null;
  const items = selected.map((row) => {
    const item = { ...row };
    delete item._pageTime;
    delete item._pageId;
    delete item._pageRow;
    return item;
  });
  return { items, nextCursor };
}
