import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { File, MpegAudioFileSettings, FlacFileSettings, TagTypes } from 'node-taglib-sharp';
import decodeTagTypes from '../decodeTagTypes.js';
import { getTagInfo } from '../musicMetadata.js';
import { flattenTagValue, getEncoderFieldsFromNative } from '../tags/utils.js';
/* import { findRoot } from '../updateFilesWorker.js'; */

export function insertFiles(db, files) {
  const stmtCache = new Map();

  const getInsertStmt = (obj) => {
    const keys = Object.keys(obj).sort(); // stable order
    const cacheKey = keys.join(',');

    if (stmtCache.has(cacheKey)) {
      return stmtCache.get(cacheKey);
    }

    const cols = keys.map((k) => `"${k}"`).join(', ');
    const placeholders = keys.map((k) => '@' + k).join(', ');
    const sql = `INSERT INTO "audio-tracks" (${cols}) VALUES (${placeholders})`;

    const stmt = db.prepare(sql);
    stmtCache.set(cacheKey, stmt);
    return stmt;
  };

  try {
    const insertMany = db.transaction((files) => {
      for (const f of files) {
        // strip undefined only, allow nulls if explicit
        const cleaned = Object.fromEntries(Object.entries(f).filter(([_, v]) => v !== undefined));

        const stmt = getInsertStmt(cleaned);
        stmt.run(cleaned);
      }
    });

    insertMany(files);
    return { success: true, message: 'Files inserted successfully' };
  } catch (error) {
    console.error('Error inserting files:', error);
    return { success: false, message: `Error inserting files: ${error.message}` };
  }
}

export function updateFiles(db, files) {
  // Log the files being passed in for debugging
  /* console.log('updateFiles: ', files); */

  // A cache to store prepared SQL statements, keyed by the column set being updated
  // In this app, since every file object likely includes *all* columns, only one cached
  // statement will typically be created and reused for all updates.
  const stmtCache = new Map();

  /**
   * Helper function that generates (or retrieves from cache) an UPDATE statement
   * for a given object shape.
   *
   * If all objects in the `files` array include all columns, this will generate
   * one statement and reuse it. If some objects omit certain columns (e.g. partial
   * updates), then separate statements will be generated and cached by column set.
   *
   * @param {Object} obj - A file record with keys representing DB columns.
   * @returns {Statement} A prepared SQLite statement ready for execution.
   */
  const getUpdateStmt = (obj) => {
    // Get all keys except the primary key (WHERE condition key)
    const keys = Object.keys(obj)
      .filter((k) => k !== 'track_id') // exclude WHERE key
      .sort(); // sort for consistent cache key order

    // Create a cache key based on sorted column names
    const cacheKey = keys.join(',');

    console.log('keys: ', keys, 'cacheKey: ', cacheKey);

    // If a matching statement exists in cache, reuse it
    if (stmtCache.has(cacheKey)) {
      return stmtCache.get(cacheKey);
    }

    // Build the SQL string dynamically based on the object keys
    const assignments = keys.map((k) => `"${k}" = @${k}`).join(', ');
    const sql = `
UPDATE "audio-tracks"
SET ${assignments}
WHERE track_id = @track_id
`;

    // Prepare the statement and store it in the cache
    const stmt = db.prepare(sql);
    stmtCache.set(cacheKey, stmt);
    return stmt;
  };

  try {
    /**
     * Wrap the updates in a transaction to ensure atomicity.
     * If any update fails, the whole batch is rolled back.
     */
    const updateMany = db.transaction((files) => {
      for (const f of files) {
        // Remove undefined values only (leave explicit nulls intact)
        const cleaned = Object.fromEntries(Object.entries(f).filter(([_, v]) => v !== undefined));

        // Ensure primary key (track_id) is present
        if (!cleaned.track_id) {
          throw new Error('Missing track_id for update');
        }

        // Get the appropriate prepared statement for this file shape
        const stmt = getUpdateStmt(cleaned);

        // Execute the statement with the file's data
        stmt.run(cleaned);
      }
    });

    // Run the transaction
    updateMany(files);

    return { success: true, message: 'Files updated successfully' };
  } catch (error) {
    // Handle and log any errors during the update process
    console.error('Error updating files:', error);
    return { success: false, message: `Error updating files: ${error.message}` };
  }
}

export function checkDataType(entry) {
  if (entry === undefined || entry === null) {
    return null;
  } else if (Array.isArray(entry)) {
    return entry.join(', ');
  } else if (typeof entry === 'object' && !Array.isArray(entry)) {
    return flattenTagValue(entry);
  } else if (typeof entry === 'string') {
    return entry;
  } else if (typeof entry === 'number') {
    return Number(entry);
  } else if (typeof entry === 'boolean') {
    if (entry === true) return 1;
    return 0;
  }
}

/* let newestRoots;
export function getRoots(db) {
  const roots = db.prepare('SELECT root FROM roots');

  newestRoots = roots.all().map((row) => row.root);
}

const findRoot = (file) => {
  for (const root of newestRoots) {
    if (file.startsWith(root)) {
      return root;
    }
  }
  return 'No root found';
}; */

export async function parseMeta(files, op, findRoot) {
  MpegAudioFileSettings.defaultTagTypes = TagTypes.Id3v2;
  FlacFileSettings.defaultTagTypes = TagTypes.Xiph;
  const filesMetadata = [];

  for (const file of files) {
    try {
      const filePath = op === 'new' ? file : file.id;
      const myFile = await File.createFromPath(filePath);

      const mmInfo = await getTagInfo(filePath); // { warnings, tags: meta.native }
      const tagWarnings = mmInfo.warnings ? true : undefined;
      const { encoder, encoderSettings, encodedBy } = getEncoderFieldsFromNative(mmInfo.tags);

      const fileStats = await fs.promises.stat(filePath);
      filesMetadata.push({
        track_id: op === 'new' ? uuidv4() : file.track_id,
        root: findRoot(op === 'new' ? file : file.id),
        audiotrack: filePath /* op === 'new' ? file : file.audiotrack, */,
        modified: fileStats.mtimeMs || null,
        birthtime: fileStats.birthtime.toISOString() || null,
        like: 0,
        error: null,
        albumArtists: checkDataType(myFile.tag.albumArtists),
        album: checkDataType(myFile.tag.album),
        audioBitrate: checkDataType(myFile.properties.audioBitrate),
        audioSampleRate: checkDataType(myFile.properties.audioSampleRate),
        beatsPerMinute: checkDataType(myFile.tag.beatsPerMinute),
        codecs: checkDataType(myFile.properties.description),
        composers: checkDataType(myFile.tag.composers),
        conductor: checkDataType(myFile.tag.conductor),
        copyright: checkDataType(myFile.tag.copyright),
        comment: checkDataType(myFile.tag.comment),
        disc: checkDataType(myFile.tag.disc),
        discCount: checkDataType(myFile.tag.discCount),
        description: checkDataType(myFile.tag.description),
        duration: checkDataType(myFile.properties.durationMilliseconds),
        encoder: checkDataType(encoder, 'encoder'),
        encodedBy: checkDataType(encodedBy, 'encoded_by'),
        encoderSettings: checkDataType(encoderSettings, 'encoder_settings'),
        genres: checkDataType(myFile.tag.genres),
        isCompilation: checkDataType(myFile.tag.isCompilation),
        isrc: checkDataType(myFile.tag.isrc),
        lyrics: checkDataType(myFile.tag.lyrics),
        performers: checkDataType(myFile.tag.performers),
        performersRole: checkDataType(myFile.tag.performersRole),
        pictures: myFile.tag.pictures?.[0]?.data ? 1 : 0,
        publisher: checkDataType(myFile.tag.publisher),
        remixedBy: checkDataType(myFile.tag.remixedBy),
        replayGainAlbumGain: checkDataType(myFile.tag.replayGainAlbumGain) || null,
        replayGainAlbumPeak: checkDataType(myFile.tag.replayGainAlbumPeak) || null,
        replayGainTrackGain: checkDataType(myFile.tag.replayGainTrackGain) || null,
        replayGainTrackPeak: checkDataType(myFile.tag.replayGainTrackPeak) || null,
        tagTypes: checkDataType(decodeTagTypes(myFile.tagTypesOnDisk >>> 0).join(', ')),
        tagWarnings: tagWarnings ? 1 : 0,
        title: checkDataType(myFile.tag.title),
        track: checkDataType(myFile.tag.track),
        trackCount: checkDataType(myFile.tag.trackCount),
        year: checkDataType(myFile.tag.year)
      });
    } catch (error) {
      console.error(`Error processing file ${file}: ${error.message}`);
      const fileStats = await fs.promises.stat(op === 'new' ? file : file.id);
      filesMetadata.push({
        track_id: op === 'new' ? uuidv4() : file.track_id,
        root: findRoot(op === 'new' ? file : file.id),
        audiotrack: op === 'new' ? file : file.id,
        modified: fileStats.mtimeMs || null,
        birthtime: fileStats.birthtime.toISOString() || null,
        error: error.toString()
      });
    }
  }
  return filesMetadata;
}
export async function pruneBackups(dir, max = 10) {
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('backup-') && f.endsWith('.db'))
      .map((f) => ({
        name: f,
        time: fs.statSync(path.join(dir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time); // newest first

    const old = files.slice(max);
    for (const file of old) {
      fs.unlinkSync(path.join(dir, file.name));
      console.log(`Pruned old backup: ${file.name}`);
    }
  } catch (err) {
    console.error('Backup pruning failed:', err.message);
  }
}
