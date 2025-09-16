import { parentPort, workerData } from 'worker_threads';
import fs from 'fs';
import path from 'path';
import process from 'node:process';
import { File, MpegAudioFileSettings, FlacFileSettings, TagTypes } from 'node-taglib-sharp';
import decodeTagTypes from './decodeTagTypes.js';
import { flattenTagValue, getEncoderFieldsFromNative } from './tags/utils.js';
import { getTagInfo } from './musicMetadata.js';
import { updateFiles, checkDataType, parseMeta } from './utility/utils.js';
import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';

const mode = import.meta.env.MODE;
const dbPath =
  mode === 'development'
    ? path.join(process.cwd(), import.meta.env.MAIN_VITE_DB_PATH_DEV)
    : path.join(workerData, 'music.db');

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

const allTracks = () => {
  const alltracks = db.prepare('SELECT track_id, audiotrack, modified FROM "audio-tracks"');
  const tracks = alltracks.all();
  return tracks;
};

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
          tagTypes = @tagTypes,
          tagWarnings = @tagWarnings,
          title = @title,
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

/* const insertFiles = (files) => {

  const stmtCache = new Map();

  const getInsertStmt = (obj) => {
    const keys = Object.keys(obj).sort(); 
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

/* const checkDataType = (entry) => {
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
      const { encoder, encoderSettings, encodedBy } = getEncoderFieldsFromNative(mmInfo.tags);

      const fileStats = await fs.promises.stat(filePath);
      filesMetadata.push({
        track_id: op === 'new' ? uuidv4() : file.track_id,
        root: findRoot(op === 'new' ? file : file.id),
        audiotrack: filePath,
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
}; */

const run = async (cb) => {
  let status = { modified: 0, nochange: false };
  const updatedTracks = [];
  const result = await allTracks();
  /*  console.log('all-tracks: ', result); */

  for await (const r of result) {
    if (!r) return;
    const stats = await fs.promises.stat(r.audiotrack);
    const lastModified = stats.mtimeMs;
    if (lastModified > r.modified) {
      /* console.log('lastModified > r.modified'); */
      updatedTracks.push(r);
    }
  }
  if (!updatedTracks.length) {
    /* console.log('updated tracks with no length: ', updatedTracks); */
    status.nochange = true;
    return Promise.resolve(cb(status));
  }
  /* await parseMeta(updatedTracks).then((parsed) => triggerInsert(parsed)); */
  const moddedArray = updatedTracks.map((obj) => {
    const { audiotrack, ...rest } = obj;
    return { id: audiotrack, ...rest };
  });

  const updatedMeta = await parseMeta(moddedArray, 'mod', findRoot);
  /*   if (moddedArray) {
    console.log('modded array: ', moddedArray);
  } */
  Promise.resolve(await updateFiles(db, updatedMeta)).then(() => cb(updatedMeta));
};

const initUpdateMetadata = async () => {
  return new Promise((res, rej) => {
    try {
      run((result) => res(result));
    } catch (error) {
      console.error(error.message);
      rej(error.message);
    }
  });
};

if (!parentPort) throw Error('IllegalState');
parentPort.on('message', async (message) => {
  console.log('message: ', message);
  try {
    const result = await initUpdateMetadata(message);
    /* const result = addTwoNums(2, 3); */
    parentPort.postMessage({ result });
  } catch (error) {
    parentPort.postMessage({ error: error.message });
  }
});
