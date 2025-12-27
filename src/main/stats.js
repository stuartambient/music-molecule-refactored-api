import db from './connection';

const totalTracks = () => {
  const tracksStmt = db.prepare('SELECT COUNT(*) FROM "audio-tracks"');
  const albumsStmt = db.prepare('SELECT COUNT(*) FROM albums');
  const tracksInfo = tracksStmt.get();
  const albumsInfo = albumsStmt.get();
  return { albumsInfo, tracksInfo };
};

const topHundredArtists = () => {
  const stmt = db.prepare(
    `SELECT performers, COUNT(*) as count FROM "audio-tracks" WHERE performers IS NOT NULL AND TRIM(performers) <> '' GROUP BY performers ORDER BY count DESC`
  );
  const result = stmt.all();
  return result;
};

const allTracksByArtist = (artist) => {
  try {
    let query, params;
    if (Array.isArray(artist)) {
      // Query for artist array
      const placeholders = artist.map(() => '?').join(', ');
      query = `SELECT * FROM "audio-tracks" WHERE performers IN (${placeholders})`;
      params = artist;
    } else {
      query = `SELECT * FROM "audio-tracks" WHERE performers = ?`;
      params = [artist];
    }
    const stmt = db.prepare(query);
    const result = stmt.all(...params);
    return result;
  } catch (error) {
    console.error('allTracksByArtist: sqlError: ', error.message);
  }
};

const allTracksByGenres = (genres) => {
  try {
    let query, params;
    if (genres === 'No Genres Specified') {
      // Query to handle special category
      query = `SELECT * FROM "audio-tracks" WHERE genres IS NULL OR genres = '' OR genres = ' '`;
      params = [];
    } else if (Array.isArray(genres)) {
      // Query for genres array
      const placeholders = genres.map(() => '?').join(', ');
      query = `SELECT * FROM "audio-tracks" WHERE genres IN (${placeholders})`;
      params = genres;
    } else {
      // Standard query for a single genre
      query = `SELECT * FROM "audio-tracks" WHERE genres = ?`;
      params = [genres];
    }
    const stmt = db.prepare(query);
    const result = stmt.all(...params);
    return result;
  } catch (error) {
    console.error('allTracksByGenres: sqlError: ', error.message);
  }
};

const allTracksByRoot = (root) => {
  // Corrected SQL query string and removed the extra `}`
  const stmt = db.prepare(`SELECT * FROM "audio-tracks" WHERE root = ?`);
  // Execute the prepared statement with `root` as the parameter
  const result = stmt.all(root);
  return result;
};

const distinctDirectories = () => {
  // Define the SQL query to get unique color values
  const sql = 'SELECT DISTINCT rootlocation FROM albums';

  // Execute the query
  const rows = db.prepare(sql).all();

  // Extract just the color values
  const uniqueDirectories = rows.map((row) => row.rootlocation);
  return uniqueDirectories;
};

const genresWithCount = () => {
  const stmt = db.prepare(
    `
    SELECT 
      CASE 
        WHEN genres IS NULL OR genres = '' OR genres = ' ' THEN 'No Genres Specified' 
        ELSE genres 
      END as genre_display,
      COUNT(*) as count 
    FROM "audio-tracks" 
    GROUP BY genre_display 
    ORDER BY 
      CASE 
        WHEN genre_display = 'No Genres Specified' THEN 1 
        ELSE 2 
      END, lower(genre_display)
  `
  );
  const results = stmt.all();
  return results;
};

const albumsByTopFolder = (folder) => {
  const stmt = db.prepare('SELECT * FROM albums WHERE rootlocation = ?');

  const results = stmt.all(folder);
  return results;
};

export {
  totalTracks,
  topHundredArtists,
  genresWithCount,
  allTracksByArtist,
  allTracksByGenres,
  allTracksByRoot,
  distinctDirectories,
  albumsByTopFolder
};
