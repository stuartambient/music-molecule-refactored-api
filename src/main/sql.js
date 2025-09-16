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

const createRootsTable = `CREATE TABLE IF NOT EXISTS roots ( id INTEGER PRIMARY KEY AUTOINCREMENT, root TEXT UNIQUE)`;

const initializeDatabase = () => {
  db.exec(createAudioTracks);
  db.exec(createAlbumsTable);
  db.exec(createRootsTable);
};

/* const insertFiles = (files) => {
  const insert = db.prepare(`
  INSERT INTO "audio-tracks"
            (track_id,
             root,
             audiotrack,
             modified,
             like,
             error,
             albumArtists,
             album,
             audioBitrate,
             audioSamplerate,
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
             title,
             track,
             trackCount,
             year)
VALUES      (@track_id,
             @root,
             @audiotrack,
             @modified,
             @like,
             @error,
             @albumArtists,
             @album,
             @audioBitrate,
             @audioSampleRate,
             @beatsPerMinute,
             @codecs,
             @composers,
             @conductor,
             @copyright,
             @comment,
             @disc,
             @discCount,
             @description,
             @duration,
             @encoder,
             @encodedBy,
             @encoderSettings,
             @genres,
             @isCompilation,
             @isrc,
             @lyrics,
             @performers,
             @performersRole,
             @pictures,
             @publisher,
             @remixedBy,
             @replayGainAlbumGain,
             @replayGainAlbumPeak,
             @replayGainTrackGain,
             @replayGainTrackPeak,
             @title,
             @track,
             @trackCount,
             @year) `);

  try {
    const insertMany = db.transaction((files) => {
      for (const f of files) insert.run(f);
    });

    insertMany(files);
    return { success: true, message: 'Files inserted successfully' };
  } catch (error) {
    console.error('Error inserting files:', error);
    return { success: false, message: `Error inserting files: ${error.message}` };
  }
}; */

/* const deleteFiles = (files) => {
  const deleteFile = db.prepare('DELETE FROM "audio-tracks" WHERE audiotrack = ?');

  const deleteMany = db.transaction((files) => {
    for (const f of files) deleteFile.run(f);
  });

  deleteMany(files);
}; */

/* const insertAlbums = (data) => {
  const insert = db.prepare(
    'INSERT INTO albums(id, rootlocation, foldername, fullpath, img) VALUES (@id, @root, @name, @fullpath, @img)'
  );

  const insertMany = db.transaction((albums) => {
    for (const a of albums) {
      if (!a.img) {
        a.img = null;
      }
      insert.run(a);
    }
  });

  insertMany(data);
}; */

/* const deleteAlbums = async (data) => {
  const deleteA = db.prepare('DELETE FROM albums WHERE fullpath = ?');
  const deleteMany = db.transaction((data) => {
    for (const d of data) deleteA.run(d);
  });
  deleteMany(data);
}; */

const getAlbumsNullImg = () => {
  const getAllAlbums = db.prepare('SELECT fullpath, img FROM albums WHERE img IS NULL');
  const albums = getAllAlbums.all();
  return albums;
};

/* const getAlbum = (id) => {
  const getAnAlbum = db.prepare('SELECT fullpath FROM albums WHERE id = ?');
  const album = getAnAlbum.get(id);
  const files = db.prepare('SELECT * FROM "audio-tracks" WHERE audiotrack LIKE ?');
  const assocFiles = files.all(`${album.fullpath}%`);
  const albumFiles = [];
  assocFiles.forEach((a) => {
    albumFiles.push(a);
  });
  return albumFiles;
}; */

/* const checkRecordsExist = (tracks) => {
  for (const track of tracks) {
    const record = db
      .prepare(
        `
      SELECT * FROM "audio-tracks"
      WHERE audiotrack = @audiotrack AND track_id = @track_id
    `
      )
      .get({ audiotrack: track.audiotrack, track_id: track.track_id });
  }
}; */

const getAllPkeys = () => {
  const alltracks = db.prepare('SELECT track_id FROM "audio-tracks"');

  return alltracks.all();
};
const getAllTracks = (rows) => {
  const tracks = db.prepare('SELECT * FROM "audio-tracks" WHERE track_id = ?');

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

  return shuffledTracks;
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

const getPlaylist = (playlist) => {
  /* console.log('playlist: ', playlist);
  console.log('getPlaylist'); */

  if (!playlist || playlist.length === 0) {
    console.log('Empty playlist');
    return [];
  }

  const albumFiles = [];
  const plfile = db.prepare(
    'SELECT track_id, like, audiotrack, performers, title, album FROM "audio-tracks" WHERE audiotrack = ?'
  );

  playlist.forEach((pl) => {
    try {
      const file = plfile.get(pl);
      if (file) {
        albumFiles.push(file);
      } else {
        console.warn(`File for audiotrack ${pl} not found in the database.`);
      }
    } catch (error) {
      console.error(`Error retrieving audiotrack ${pl}:`, error);
    }
  });

  /* console.log('albumFiles: ', albumFiles); */
  return albumFiles;
};

const allAlbumsByScroll = (offsetNum, sort) => {
  /* console.log('allAlbumsByScroll'); */

  const query = `SELECT * FROM albums ORDER BY birthtime ${sort} LIMIT 200 OFFSET $offset`;

  try {
    const stmt = db.prepare(query);
    return stmt.all({ offset: offsetNum * 200 });
  } catch (e) {
    return e.message;
  }
};

const allAlbumsBySearchTerm = (offsetNum, text, sort) => {
  /* console.log('allAlbumsBySearchTerm'); */
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

  /*  console.log('pathsArray: ', pathsArray); */

  const queryParts = pathsArray.map(() => 'audiotrack LIKE ?').join(' OR ');
  /* console.log('queryParts: ', queryParts); */
  const query = `SELECT * FROM "audio-tracks" WHERE ${queryParts}`;
  /* console.log('query: ', query); */
  const params = pathsArray.map((path) => `${path}%`);
  /* console.log('params: ', params); */

  const albumFiles = db.prepare(query).all(...params);
  /* console.log('albumFiles: ', albumFiles.length); */
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
  /* console.log('id: ', id); */
  const isLiked = db.prepare('SELECT like FROM "audio-tracks" WHERE track_id = ?');
  const status = isLiked.get(id);
  /* console.log('isLiked.like: ', status); */
  return status;
};

const updateCoversInDatabase = (coversArray) => {
  /* coversArray.forEach((cover) => console.log(cover)); */
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
    // If the array is empty, delete all entries in the table
    const deleteAllQuery = `DELETE FROM roots`;
    const empty = db.prepare(deleteAllQuery).run();
    result.push({ Deleted: empty.changes });
    return result;
  }
  const placeholders = roots.map(() => '?').join(',');

  // Delete entries in the database that are not in the array
  const deleteQuery = `
    DELETE FROM roots
    WHERE root NOT IN (${placeholders})
  `;
  const info = db.prepare(deleteQuery).run(...roots);
  result.push({ Deleted: info.changes });

  // Insert new values and ignore duplicates
  const insertQuery = `
    INSERT OR IGNORE INTO roots (root)
    VALUES ${roots.map(() => '(?)').join(',')}
  `;
  const info2 = db.prepare(insertQuery).run(...roots);
  result.push({ Inserted: info2.changes });

  return result;
};

export {
  /* insertFiles,
  insertAlbums,
  deleteAlbums,
  deleteFiles,
  getAlbum, */
  getAllPkeys,
  allTracksByScroll,
  allTracksBySearchTerm,
  allAlbumsByScroll,
  allAlbumsBySearchTerm,
  filesByAlbum,
  likeTrack,
  isLiked,
  getPlaylist,
  allCoversByScroll,
  allMissingCoversByScroll,
  getAllTracks,
  updateCoversInDatabase,
  /* checkRecordsExist, */
  getAlbumsNullImg,
  getRoots,
  updateRoots,
  initializeDatabase
};
