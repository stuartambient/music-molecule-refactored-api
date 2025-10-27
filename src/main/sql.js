import db from './connection';

const createAlbumsTable = `CREATE TABLE IF NOT EXISTS albums ( 
    id PRIMARY KEY, 
    rootlocation, 
    foldername, 
    fullpath, 
    datecreated TEXT DEFAULT CURRENT_TIMESTAMP, 
    img, 
    birthtime, 
    modified )`;

const createAudioTracks = `
CREATE TABLE IF NOT EXISTS "audio-tracks" (
    track_id PRIMARY KEY,
    root,
    audiotrack,
    modified,
    like,
    created_datetime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    error,
    albumArtists,
    album,
    audioBitrate,
    audioSampleRate,
    beatsPerMinute,
    codecs,
    composers,
    conductor,
    copyright,
    comment,
    disc,
    discCount,
    description,
    duration,
    encoder,
    encodedBy,
    encoderSettings,
    genres,
    isCompilation,
    isrc,
    lyrics,
    performers,
    performersRole,
    pictures,
    publisher,
    remixedBy,
    replayGainAlbumGain,
    replayGainAlbumPeak,
    replayGainTrackGain,
    replayGainTrackPeak,
    tagWarnings,
    title,
    track,
    trackCount,
    year,
    birthtime,
    tagTypes
);`;

const createIndexAudioTrack = `
CREATE INDEX IF NOT EXISTS idx_audio_tracks_audiotrack
ON "audio-tracks"(audiotrack COLLATE NOCASE);
`;

const createRootsTable = `CREATE TABLE IF NOT EXISTS roots ( id INTEGER PRIMARY KEY AUTOINCREMENT, root TEXT UNIQUE)`;

const initializeDatabase = () => {
  db.exec(createAudioTracks);
  db.exec(createAlbumsTable);
  db.exec(createRootsTable);
  db.exec(createIndexAudioTrack);
};

const getAlbumsNullImg = () => {
  const getAllAlbums = db.prepare('SELECT fullpath, img FROM albums WHERE img IS NULL');
  const albums = getAllAlbums.all();
  return albums;
};

const getAllPkeys = () => {
  const alltracks = db.prepare('SELECT track_id FROM "audio-tracks"');

  return alltracks.all();
};
const getAllTracks = (rows) => {
  /*   const tracks = db.prepare('SELECT * FROM "audio-tracks" WHERE track_id = ?');

  const shuffledTracks = [];
  for (const r of rows) {
    try {
      const track = tracks.get(r.track_id);
      if (track) {
        shuffledTracks.push(track);
      } else if (!track) {
        console.log('no track avail: ', r.track_id);
      }
    } catch (error) {
      console.error(`Error retrieving rowid ${r}:`, error);
    }
  }

  return shuffledTracks; */
  if (!rows?.length) return [];

  const ids = rows.map((r) => r.track_id).filter(Boolean);
  const placeholders = ids.map(() => '?').join(',');
  const sql = `SELECT * FROM "audio-tracks" WHERE track_id IN (${placeholders})`;
  const result = db.prepare(sql).all(...ids);
  const map = new Map(result.map((r) => [r.track_id, r]));
  return ids.map((id) => map.get(id)).filter(Boolean);
};

const allTracksByScroll = (offsetNum, sort) => {
  /*  console.log('allTracksByScroll'); */
  const query = `SELECT track_id, like, audiotrack, performers, title, album FROM "audio-tracks" ORDER BY birthtime ${sort} LIMIT 200 OFFSET $offset`;
  const stmt = db.prepare(query);
  return stmt.all({ offset: offsetNum * 200 });
};

const allTracksBySearchTerm = (offsetNum, text, sort) => {
  /* console.log('allTracksBySearchTerm'); */
  const term = `%${text}%`;
  const query = `SELECT track_id, like, audiotrack, performers, title, album FROM "audio-tracks" WHERE audiotrack LIKE ? ORDER BY birthtime ${sort} LIMIT 200 OFFSET ?`;
  const params = [term, offsetNum * 200];
  const stmt = db.prepare(query);
  return stmt.all(...params);
};

const allAlbumsByScroll = (offsetNum, sort) => {
  const query = `SELECT * FROM albums ORDER BY birthtime ${sort} LIMIT 200 OFFSET $offset`;

  try {
    const stmt = db.prepare(query);
    return stmt.all({ offset: offsetNum * 200 });
  } catch (e) {
    return e.message;
  }
};

const allAlbumsBySearchTerm = (offsetNum, text, sort) => {
  const term = `%${text}%`;

  const query = `SELECT * FROM albums WHERE fullpath LIKE ? ORDER BY birthtime ${sort} LIMIT 200 OFFSET ?`;
  const params = [term, offsetNum * 200];

  try {
    const stmt = db.prepare(query);
    return stmt.all(...params);
  } catch (e) {
    return e.message;
  }
};

const allCoversByScroll = (offsetNum, sort, term = null) => {
  const order = sort === 'ASC' ? 'ASC' : 'DESC';
  if (term === '') {
    const stmt = db.prepare(
      `SELECT id, foldername, fullpath, img FROM albums ORDER BY birthtime ${order} LIMIT 100 OFFSET ${
        offsetNum * 100
      }`
    );
    return stmt.all();
  } else {
    const searchTerm = `%${term}%`;
    const stmt = db.prepare(
      `SELECT id, foldername, fullpath, img FROM albums WHERE fullpath LIKE ? ORDER BY birthtime ${order} LIMIT 100 OFFSET ${
        offsetNum * 100
      }`
    );
    return stmt.all(searchTerm);
  }
};

const allMissingCoversByScroll = (offsetNum, sort) => {
  const order = sort === 'ASC' ? 'ASC' : 'DESC';
  const stmt = db.prepare(
    `SELECT id, foldername, fullpath, img FROM albums WHERE img IS NULL ORDER BY birthtime ${order} LIMIT 100 OFFSET ${
      offsetNum * 100
    }`
  );
  return stmt.all();
};

const filesByAlbum = (albumPath) => {
  /*  console.log('filesByAlbum'); */
  const pathsArray = Array.isArray(albumPath) ? albumPath : [albumPath];

  if (pathsArray.length === 0) {
    return [];
  }

  const queryParts = pathsArray.map(() => 'audiotrack LIKE ?').join(' OR ');
  const query = `SELECT * FROM "audio-tracks" WHERE ${queryParts}`;
  const params = pathsArray.map((path) => `${path}%`);

  const albumFiles = db.prepare(query).all(...params);
  return albumFiles;
};

const likeTrack = (fileId) => {
  let status;
  const isLiked = db.prepare('SELECT like FROM "audio-tracks" WHERE track_id = ?');
  const currentLike = isLiked.get(fileId);
  currentLike.like === 1 ? (status = 0) : (status = 1);
  const updateLike = db.prepare('UPDATE "audio-tracks" SET like = ? WHERE track_id = ? ');
  const info = updateLike.run(status, fileId);
  return [info, currentLike.like];
};

const isLiked = (id) => {
  const isLiked = db.prepare('SELECT like FROM "audio-tracks" WHERE track_id = ?');
  const status = isLiked.get(id);
  return status;
};

const updateCoversInDatabase = (coversArray) => {
  const updateStmt = db.prepare(`
    UPDATE albums
    SET img = @img
    WHERE fullpath = @fullpath
  `);
  try {
    const transaction = db.transaction((coversArray) => {
      coversArray.forEach((cover) => {
        if (!cover.img) return;
        updateStmt.run(cover);
      });
    });
    transaction(coversArray);
    return `success with ${coversArray.length} covers`;
  } catch (e) {
    return e.message;
  }
};

const getRoots = () => {
  const roots = db.prepare('SELECT root FROM roots');

  return roots.all().map((row) => row.root);
};

const updateRoots = (roots) => {
  const result = [];
  if (roots.length === 0) {
    const deleteAllQuery = `DELETE FROM roots`;
    const empty = db.prepare(deleteAllQuery).run();
    result.push({ Deleted: empty.changes });
    return result;
  }
  const placeholders = roots.map(() => '?').join(',');

  const deleteQuery = `
    DELETE FROM roots
    WHERE root NOT IN (${placeholders})
  `;
  const info = db.prepare(deleteQuery).run(...roots);
  result.push({ Deleted: info.changes });

  const insertQuery = `
    INSERT OR IGNORE INTO roots (root)
    VALUES ${roots.map(() => '(?)').join(',')}
  `;
  const info2 = db.prepare(insertQuery).run(...roots);
  result.push({ Inserted: info2.changes });

  return result;
};

export {
  getAllPkeys,
  allTracksByScroll,
  allTracksBySearchTerm,
  allAlbumsByScroll,
  allAlbumsBySearchTerm,
  filesByAlbum,
  likeTrack,
  isLiked,
  allCoversByScroll,
  allMissingCoversByScroll,
  getAllTracks,
  updateCoversInDatabase,
  getAlbumsNullImg,
  getRoots,
  updateRoots,
  initializeDatabase
};
