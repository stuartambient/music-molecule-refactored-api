import { parentPort, workerData } from 'worker_threads';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';
import updateTags from './updateTags';
/* import { v4 as uuidv4 } from 'uuid'; */
/* import { File, MpegAudioFileSettings, FlacFileSettings, TagTypes } from 'node-taglib-sharp'; */
/* import decodeTagTypes from './decodeTagTypes.js'; */
/* import { flattenTagValue, getEncoderFieldsFromNative } from './tags/utils'; */
/* import { getTagInfo } from './musicMetadata'; */
import { updateFiles, parseMeta } from './utility/utils.js';
/* import { parseMeta } from './utility'; */
console.log('worker path: ', path.join(workerData.workerPath, 'music.db'));
const mode = import.meta.env.MODE;
const dbPath =
  mode === 'development'
    ? path.join(process.cwd(), import.meta.env.MAIN_VITE_DB_PATH_DEV)
    : path.join(workerData.workerPath, 'music.db');

const db = new Database(dbPath);
const createRootsTable = `CREATE TABLE IF NOT EXISTS roots ( id INTEGER PRIMARY KEY AUTOINCREMENT, root TEXT UNIQUE)`;
db.exec(createRootsTable);

let newestRoots;
const getRoots = () => {
  const roots = db.prepare('SELECT root FROM roots');

  newestRoots = roots.all().map((row) => row.root);
};

getRoots();

const findRoot = (file) => {
  for (const root of newestRoots) {
    if (file.startsWith(root)) {
      return root;
    }
  }
  return 'No root found';
};

/* const checkDataType = (entry, field = null) => {
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
}; */

/* MpegAudioFileSettings.defaultTagTypes = TagTypes.Id3v2;
FlacFileSettings.defaultTagTypes = TagTypes.Xiph;

const parseMeta = async (files, op) => {
  const filesMetadata = [];

  for (const file of files) {
    try {
      const filePath = op === 'new' ? file : file.id;
      const myFile = await File.createFromPath(filePath);

      const mmInfo = await getTagInfo(filePath); 
      const tagWarnings = mmInfo.warnings ? true : undefined;
      const { encoder, encoderSettings, encodedBy } = getEncoderFieldsFromNative(mmInfo);

      const fileStats = await fs.promises.stat(filePath);
      filesMetadata.push({
        track_id: op === 'new' ? uuidv4() : file.track_id,
        root: findRoot(op === 'new' ? file : file.id),
        audiotrack: filePath,
        modified: fileStats.mtimeMs || null,
        birthtime: fileStats.birthtime.toISOString() || null,
        like: 0,
        error: null,
        albumArtists: checkDataType(myFile.tag.albumArtists, 'albumArtists'),
        album: checkDataType(myFile.tag.album, 'album'),
        audioBitrate: checkDataType(myFile.properties.audioBitrate, 'audioBitrate'),
        audioSampleRate: checkDataType(myFile.properties.audioSampleRate, 'audioSampleRaate'),
        beatsPerMinute: checkDataType(myFile.tag.beatsPerMinute, 'beatsPerMinute'),
        codecs: checkDataType(myFile.properties.description, 'codecs'),
        composers: checkDataType(myFile.tag.composers, 'composers'),
        conductor: checkDataType(myFile.tag.conductor, 'conductor'),
        copyright: checkDataType(myFile.tag.copyright, 'copyright'),
        comment: checkDataType(myFile.tag.comment, 'comment'),
        disc: checkDataType(myFile.tag.disc, 'disc'),
        discCount: checkDataType(myFile.tag.discCount, 'discCount'),
        description: checkDataType(myFile.tag.description, 'description'),
        duration: checkDataType(myFile.properties.durationMilliseconds, 'duration'),
        encoder: checkDataType(encoder, 'encoder'),
        encodedBy: checkDataType(encodedBy, 'encoded_by'),
        encoderSettings: checkDataType(encoderSettings, 'encoder_settings'),
        genres: checkDataType(myFile.tag.genres, 'genres'),
        isCompilation: checkDataType(myFile.tag.isCompilation, 'isCompilation'),
        isrc: checkDataType(myFile.tag.isrc, 'isrc'),
        lyrics: checkDataType(myFile.tag.lyrics, 'lyrics'),
        performers: checkDataType(myFile.tag.performers, 'performers'),
        performersRole: checkDataType(myFile.tag.performersRole, 'performersRole'),
        pictures: myFile.tag.pictures?.[0]?.data ? 1 : 0,
        publisher: checkDataType(myFile.tag.publisher, 'publisher'),
        remixedBy: checkDataType(myFile.tag.remixedBy, 'remixedBy'),
        replayGainAlbumGain:
          checkDataType(myFile.tag.replayGainAlbumGain, 'replayGainAlbumGain') || null,
        replayGainAlbumPeak:
          checkDataType(myFile.tag.replayGainAlbumPeak, 'replayGainAlbumPeak') || null,
        replayGainTrackGain:
          checkDataType(myFile.tag.replayGainTrackGain, 'replayGainTrackGain') || null,
        replayGainTrackPeak:
          checkDataType(myFile.tag.replayGainTrackPeak, 'replayGainTrackPeak') || null,
        tagTypes: checkDataType(decodeTagTypes(myFile.tagTypesOnDisk >>> 0).join(', '), 'tagTypes'),
        tagWarnings: tagWarnings ? 1 : 0,
        title: checkDataType(myFile.tag.title, 'title'),
        track: checkDataType(myFile.tag.track, 'track'),
        trackCount: checkDataType(myFile.tag.trackCount, 'trackCount'),
        year: checkDataType(myFile.tag.year, 'year')
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
}; */

/* const insertFiles = (tracks) => {
  const transaction = db.transaction(() => {
    const updateStmt = db.prepare(`
      UPDATE "audio-tracks" SET 
        root = @root,
        modified = @modified,
        like = @like,
        error = @error,
        albumArtists = @albumArtists,
        album = @album,
        audioBitrate = @audioBitrate,
        audioSampleRate = @audioSampleRate,
        beatsPerMinute = @beatsPerMinute,
        codecs = @codecs,
        composers = @composers,
        conductor = @conductor,
        copyright = @copyright,
        comment = @comment,
        disc = @disc,
        discCount = @discCount,
        description = @description,
        duration = @duration,
        encoder = @encoder,
        encodedBy = @encodedBy,
        encoderSettings = @encoderSettings,
        genres = @genres,
        isCompilation = @isCompilation,
        isrc = @isrc,
        lyrics = @lyrics,
        performers = @performers,
        performersRole = @performersRole,
        pictures = @pictures,
        publisher = @publisher,
        remixedBy = @remixedBy,
        replayGainAlbumGain = @replayGainAlbumGain,
        replayGainAlbumPeak = @replayGainAlbumPeak,
        replayGainTrackGain = @replayGainTrackGain,
        replayGainTrackPeak = @replayGainTrackPeak,
        title = @title,
        tagTypes = @tagTypes,
        tagWarnings = @tagWarnings,
        track = @track,
        trackCount = @trackCount,
        year = @year
      WHERE 
        audiotrack = @audiotrack
      `);

    for (const track of tracks) {
      updateStmt.run({
        track_id: track.track_id,
        audiotrack: track.audiotrack,
        root: track.root,
        modified: track.modified,
        like: track.like,
        error: track.error,
        albumArtists: track.albumArtists,
        album: track.album,
        audioBitrate: track.audioBitrate,
        audioSampleRate: track.audioSampleRate,
        beatsPerMinute: track.beatsPerMinute,
        codecs: track.codecs,
        composers: track.composers,
        conductor: track.conductor,
        copyright: track.copyright,
        comment: track.comment,
        disc: track.disc,
        discCount: track.discCount,
        description: track.description,
        duration: track.duration,
        encoder: track.encoder,
        encodedBy: track.encodedBy,
        encoderSettings: track.encoderSettings,
        genres: track.genres,
        isCompilation: track.isCompilation,
        isrc: track.isrc,
        lyrics: track.lyrics,
        performers: track.performers,
        performersRole: track.performersRole,
        pictures: track.pictures,
        publisher: track.publisher,
        remixedBy: track.remixedBy,
        replayGainAlbumGain: track.replayGainAlbumGain,
        replayGainAlbumPeak: track.replayGainAlbumPeak,
        replayGainTrackGain: track.replayGainTrackGain,
        replayGainTrackPeak: track.replayGainTrackPeak,
        tagTypes: track.tagTypes,
        tagWarnings: track.tagWarnings,
        title: track.title,
        track: track.track,
        trackCount: track.trackCount,
        year: track.year
      });
    }
  });
  try {
    transaction();
    return 'Records updated successfully!';
  } catch (error) {
    console.error('Error updating records:', error);
    throw new Error(error);
  }
}; */

/* async function func1(data) {
  try {
    const updateTagsResult = await updateTags(data);
    console.log('updateTagsResult: ', updateTagsResult);
    console.log('data: ', data);
    const updatedArray = data.filter(
      (obj) => !updateTagsResult.errors.find((e) => e.track_id === obj.track_id)
    );
    const failedArray = data.filter((obj) =>
      updateTagsResult.errors.find((e) => e.track_id === obj.track_id)
    );

    console.log('updatedArray: ', updatedArray, 'failedArray: ', failedArray);

    if (updatedArray.length > 0 && failedArray.length === 0) {
      return { status: 'success', updatedArray };
    } else if (updatedArray.length === 0 && failedArray.length > 0) {
      return { status: 'failed', failedArray };
    } else if (updatedArray.length > 0 && failedArray.length > 0) {
      return { status: 'partial_success', updatedArray, failedArray };
    }
  } catch (error) {
    return { status: 'error', error };
  }
} */

/* const insertFiles = (files) => {
  // cache prepared statements per unique key set
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
}; */

async function func1(data) {
  try {
    const updateTagsResult = await updateTags(data);

    const failedTrackIds = new Set(updateTagsResult.errors.map((e) => e.track_id));

    const updatedArray = data.filter((obj) => !failedTrackIds.has(obj.track_id));
    const failedArray = updateTagsResult.errors; // <- no `updates` included

    /* console.log('failedArray: ', failedArray); */

    if (updatedArray.length > 0 && failedArray.length === 0) {
      return { status: 'success', updatedArray };
    } else if (updatedArray.length === 0 && failedArray.length > 0) {
      return { status: 'failed', failedArray };
    } else if (updatedArray.length > 0 && failedArray.length > 0) {
      return { status: 'partial_success', updatedArray, failedArray };
    }
  } catch (error) {
    return { status: 'error', error: error instanceof Error ? error.message : String(error) };
  }
}

async function func2(input) {
  /* console.log('parseMeta: '); */
  return new Promise((resolve, reject) => {
    try {
      const updatedMeta = parseMeta(input, 'mod', findRoot);
      resolve(updatedMeta);
    } catch (error) {
      reject(error);
    }
  });
}

async function func3(input) {
  return new Promise((resolve, reject) => {
    try {
      const updateMessage = updateFiles(db, input);
      resolve(updateMessage);
    } catch (error) {
      reject(error);
    }
  });
}

async function runSequentially(originalData) {
  const result1 = await func1(originalData);
  console.log('result 1: ', result1.status);

  if (result1.status === 'error') {
    /*  console.log('result1 on error: ', result1); */
    return result1;
  }

  if (result1.status === 'failed') {
    /* console.log('result1 failed: ', result1); */
    return { status: 'failed', failed: result1.failedArray };
  }

  const result2 = await func2(result1.updatedArray);
  const result3 = await func3(result2);

  const passed = result1.updatedArray.map((file) => file.id);
  const failed = result1.failedArray; /* ?.map((file) => file.id) || []; */

  if (result1.status === 'success') {
    return { status: 'success', passed, res: result3 };
  } else {
    return { status: 'partial_status', passed, failed, res: result3 };
  }
}

// Listen for messages from the main thread
parentPort.on('message', async () => {
  try {
    const finalResult = await runSequentially(workerData.data);
    parentPort.postMessage(finalResult);
  } catch (error) {
    parentPort.postMessage({
      status: 'error',
      message: 'Worker execution failed',
      error: error instanceof Error ? error.message : String(error),
      stack: error?.stack || null
    });
  }
});
