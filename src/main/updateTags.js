import path from 'node:path';
import { tagKeys, deleteKeys } from './tagEditValues.js';

import {
  Picture,
  File,
  TagTypes,
  MpegAudioFileSettings,
  FlacFileSettings
} from 'node-taglib-sharp';
import { inspectTags, extraneousTags } from './tag-inspector.js';
import {
  ensureWritableWithStatus,
  restoreReadOnlyWindows
} from './utility/ensureWritableWithStatus';
import { isValidImageFile, removeNullUndefinedWithReduce } from './utility/utils.js';

import {
  sanitizeFlacPicture,
  sanitizeMp3Picture,
  extractPictures
} from './utility/repairPictures.js';

/* function logBadFrame(logDir, filePath, count) {
  try {
    // ensure dir exists
    fs.mkdirSync(logDir, { recursive: true });

    const logFile = path.join(logDir, 'bad-frames.log');
    const timestamp = new Date().toISOString();

    const line = `${timestamp} | ${filePath} | bad-frames: ${count}\n`;

    fs.appendFileSync(logFile, line);
  } catch (err) {
    console.error('Failed to write bad-frame log:', err);
  }
} */

/* function cleanObject(obj) {
  console.log('clearObject: ', obj);
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => {
      if (v == null || v === 0 || v === '') return false; // null or undefined
      if (typeof v === 'number' && Number.isNaN(v)) return false;
      if (typeof v === 'string' && v.trim() === '') return false;
      if (Array.isArray(v) && (v.length === 0 || v.every((item) => item === undefined)))
        return false;
      if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) return false;

      return true; // keep
    })
  );
} */

/* console.log('ENTER updateTags'); */

function getRow(db, rowId) {
  const row = db.prepare(`SELECT albumArtists,
                                 album,
                                 beatsPerMinute,
                                 composers,
                                 conductor,
                                 copyright,
                                 comment,
                                 disc,
                                 discCount,
                                 description,
                                 genres,
                                 isCompilation,
                                 isrc,
                                 lyrics,
                                 performers,
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
                                 year,
                                 encoder,
                                 encoderSettings,
                                 encodedBy FROM "audio-tracks" WHERE track_id = ?`);
  const rowData = row.get(rowId);
  return rowData;
}

const updateTags = async (db, arr) => {
  console.log('update tags, # of tags: ', arr);
  MpegAudioFileSettings.defaultTagTypes = TagTypes.Id3v2;
  FlacFileSettings.defaultTagTypes = TagTypes.Xiph;
  const errors = [];

  for (const a of arr) {
    let writeState;
    let myFile;
    try {
      /* try {
        const acc = await fs.promises.access(a.id);
        console.log('acc: ', acc);
      } catch (err) {
        console.error('access file: ', err.toString());
        errors.push({
          track_id: a.track_id,
          id: a.id,
          error: err.toString()
        });
        continue;
      } */

      /*       if (fs.existsSync(a.id)) {
        console.log('File exists.');
      } else {
        console.log('File does not exist.');
        errors.push({
          track_id: a.track_id,
          id: a.id,
          error: 'Wrong path or file does not eixts'
        });
        continue;
      } */

      // write error with ocde
      /*     error: JSON.stringify({
  type: 'write-check',
  status: res.status,
  hadReadOnly: res.hadReadOnly,
  code: res.error?.code,
  message: res.error?.message
}) */

      writeState = await ensureWritableWithStatus(a.id);
      if (writeState.status !== 'writable' && writeState.status !== 'changed-to-writable') {
        console.log('UNWRITE CHECK FAIL:', {
          file: a.id,
          status: writeState.status,
          hadReadOnly: writeState.hadReadOnly,
          code: writeState.error?.code,
          message: writeState.error?.message
        });
      }
      if (writeState.status === 'unwritable' || writeState.status === 'locked') {
        console.log('unwritable', a.id);
        errors.push({
          track_id: a.track_id,
          id: a.id,
          error: 'file is not writeable'
        });

        continue;
      } else if (writeState.status === 'missing') {
        errors.push({
          track_id: a.track_id,
          id: a.id,
          error: 'file is missing'
        });
        continue;
      }

      let id3v2 = null;
      try {
        myFile = File.createFromPath(a.id);
        /* console.log('createFromPath: ', a.id); */
      } catch (err) {
        console.error(`File ${a.id} failed`);
        errors.push({
          track_id: a.track_id,
          id: a.id,
          error: err.toString()
        });
        continue;
      }
      if (path.extname(a.id).toLowerCase() === '.mp3') {
        sanitizeMp3Picture(myFile);
        try {
          myFile.save();
        } catch {
          /* dumpSemantic(myFile); */
          const row = getRow(db, a.track_id);
          const rowValuesOnly = removeNullUndefinedWithReduce(row);
          if (rowValuesOnly.pictures && rowValuesOnly.pictures === 1) {
            /* rowValuesOnly.pictures = myFile.tag.pictures; */
            const picData = extractPictures(myFile.tag);
            const { data, type, mimeType, description } = picData[0];
            console.log(data, type, mimeType, description);
            /* rowValuesOnly.pictures = Picture.fromFullData(data, type, mimeType, description); */
            rowValuesOnly.pictures = { data, type, mimeType, description };
            /* console.log('rowValuesOnly: ', rowValuesOnly.pictures); */

            /*   rowValuesOnly.pictures = Picture.fromFullData(data, type, mimeType, description);
            console.log('pic: ', rowValuesOnly.pictures); */
          }

          /* console.log(rowValuesOnly); */
          a.updates = { ...rowValuesOnly, ...a.updates };
          /* console.log('a.updates: ', a.updates); */

          myFile.removeTags(4294967295);
          /*  throw new Error('ending update');
          console.log('cant save: ', e.message); */
        }
        id3v2 = myFile.getTag(TagTypes.Id3v2, true);
        id3v2.version = 3;
      }

      if (path.extname(a.id).toLowerCase() === '.flac') {
        sanitizeFlacPicture(myFile);
        myFile.save();
      }
      let allUpdates = a.updates;

      /*       const ttod = myFile.tagTypesOnDisk;

      if (ttod === 2) {
        const id3v1 = myFile.getTag(TagTypes.Id3v1, false);
        id3v1.copyTo(id3v2, false);
        myFile.save();
      } */

      let info = await inspectTags(myFile);

      const removeMask = await extraneousTags(info.fileType, info.typesList);

      if (removeMask) {
        if (removeMask === 2 && path.extname(a.id).toLowerCase() === '.mp3' && id3v2) {
          let id3v1 = myFile.getTag(TagTypes.Id3v1, false);
          /* const id3v2 = myFile.getTag(TagTypes.Id3v2, true); */
          try {
            id3v1.copyTo(id3v2, false);
          } catch (e) {
            console.warn('Skipping id3v1 copy', a.id, e?.message);
            id3v1 = null;
            /* myFile.dispose();
            myFile = File.createFromPath(a.id);
            id3v2 = myFile.getTag(TagTypes.Id3v2, true);
            id3v2.version = 3; */
          }
        }
        myFile.removeTags(removeMask);
        myFile.save();
        if (removeMask === 8 && path.extname(a.id).toLowerCase() === '.mp3' && id3v2) {
          /* const id3v1 = myFile.getTag(TagTypes.Id3v1, false); */
          /* const id3v2 = myFile.getTag(TagTypes.Id3v2, true); */
          /*  id3v1.copyTo(id3v2, false); */
          myFile.removeTags(removeMask);
          myFile.save();
        }
      }

      for (const [key, value] of Object.entries(allUpdates)) {
        /* console.log('Key: ', key, 'value: ', value); */
        /* console.log('a.updates ', a.updates); */
        if (key === 'picture-location' && value === '-') {
          myFile.tag.pictures = [];
        } else if (key === 'picture-location') {
          if (isValidImageFile(value)) {
            const pic = Picture.fromPath(value);
            myFile.tag.pictures = [pic];
          } else {
            console.warn(`⚠️ Invalid image:`, value);
            errors.push({ track_id: a.track_id, id: a.id, error: 'Invalid image' });
          }
        } else if (key === 'pictures' && value === '-') {
          myFile.tag.pictures = [];
        } else if (key === 'pictures') {
          /* if (value && value.data) {
            const pic = Picture.fromFullData(
              ByteVector.fromByteArray(value.data),
              value.type ?? PictureType.FrontCover,
              value.format,
              value.description ?? ''
            ); */
          console.log(value.data, '--', value.type, '--', value.mimeType, '--', value.description);

          const pic = Picture.fromFullData(
            value.data,
            value.type,
            value.mimeType,
            value.description
          );
          myFile.tag.pictures = [pic]; // <-- CORRECT
          /*     } else {
            myFile.tag.pictures = []; // optional clear
          } */
        } else {
          try {
            if (value === '-' && key === 'performersRole') {
              const perfs = myFile.tag.performers;

              /* myFile.tag[key] = deleteKeys[key](); */
              myFile.tag.performers = [];
              myFile.tag.performersRole = [];
              myFile.save();
              myFile.dispose();
              myFile = null;
              myFile = File.createFromPath(a.id);
              const t = tagKeys['performers'](perfs.join(','));
              myFile.tag.performers = t;
              myFile.save();
            } else if (value === '-' && key !== 'performersRole') {
              myFile.tag[key] = deleteKeys[key]();
              myFile.save();
            } else {
              const t = tagKeys[key](value);
              myFile.tag[key] = t;
            }
          } catch (err) {
            console.error(
              `❌ Error setting tag '${key}'`,
              '\n   value:',
              value,
              '\n   type:',
              typeof value,
              '\n   converted:',
              tagKeys[key] ? tagKeys[key](value) : '(no converter)',
              '\n   message:',
              err.message,
              '\n   stack:',
              err.stack
            );
            if (!myFile) throw new Error(`${key}: ${err.message || String(err)}`);
            errors.push({
              track_id: a.track_id,
              id: a.id,
              field: key,
              error: `${key}: ${err.message || String(err)}`
            });
          }
        }
      }
      myFile.save();
    } catch (e) {
      console.log('updateTags final catch: ', e);
      errors.push({ track_id: a.track_id, id: a.id, error: e.message || String(e) });
      /*   errors.push({
        track_id: a.track_id,
        id: a.id,
        error: e.toString()
      }); */
      /* const errMessage = e.toString(); */
      /* console.error('🔴 Outer error caught for file:', a.id, '\n', e); */
      /*      let errMessage;

      if (e instanceof Error) {
        errMessage = e.stack || e.message;
        console.error('errMessage-1: ', errMessage);
      } else if (typeof e === 'object' && e !== null) {
        errMessage = JSON.stringify(e);
        console.error('errMessage-2: ', errMessage);
      } else {
        errMessage = String(e);
        console.error('errMessage-3: ', errMessage);
      } */
      /*   const errMessage =
        e instanceof Error
          ? e.message // NOT stack
          : typeof e === 'object' && e !== null
            ? JSON.stringify(e)
            : String(e); */
      //console.error(`Error processing file ${a.id}: ${errMessage}`);
      /* console.log({ track_id: a.track_id, id: a.id, error: errMessage }); */
      /* errors.push({ track_id: a.track_id, id: a.id, error: errMessage }); */
    } finally {
      try {
        myFile?.dispose();
      } catch (error) {
        errors.push({ track_id: a.track_id, id: a.id, error: `Closing file: ${error.message}` });
      }
      if (writeState?.status === 'changed-to-writable') {
        try {
          await restoreReadOnlyWindows(a.id);
        } catch (error) {
          errors.push({
            track_id: a.track_id,
            id: a.id,
            error: `Restoring read-only attribute: ${error.message}`
          });
        }
      }
    }
  }
  /*   console.log('errors: ', errors);
  console.log('EXIT updateTags'); */
  return { message: 'Tag updates completed with some errors', errors };
};

export default updateTags;
