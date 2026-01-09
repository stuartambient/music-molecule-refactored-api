const fs = require('fs');
const path = require('path');

import {
  Picture,
  File,
  TagTypes,
  PictureType,
  ByteVector,
  MpegAudioFileSettings,
  FlacFileSettings
} from 'node-taglib-sharp';
import { inspectTags, extraneousTags } from './tag-inspector.js';
import {
  ensureWritableWithStatus,
  restoreReadOnlyWindows
} from './utility/ensureWritableWithStatus';
import { isValidImageFile } from './utility/utils.js';

import { sanitizeFlacPicture, sanitizeMp3Picture } from './utility/repairPictures.js';

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

restoreReadOnlyWindows;

const deleteKeys = {
  albumArtists: () => [],
  album: () => '',
  beatsPerMinute: () => 0,
  composers: () => [],
  conductor: () => '',
  comment: () => '',
  copyright: () => '',
  disc: () => 0,
  discCount: () => 0,
  description: () => '',
  genres: () => [],
  isCompilation: () => false,
  isrc: () => '',
  lyrics: () => '',
  performers: () => [],
  performersRole: () => [],
  pictures: () => [],
  publisher: () => '',
  remixedBy: () => '',
  replayGainAlbumGain: () => 0,
  replayGainAlbumPeak: () => 0,
  replayGainTrackGain: () => 0,
  replayGainTrackPeak: () => 0,
  title: () => '',
  track: () => 0,
  trackCount: () => 0,
  year: () => 0
};

const tagKeys = {
  albumArtists: (param) => param?.trim()?.split(', ') || null,
  album: (param) => param?.trim() || null,
  beatsPerMinute: (param) => (param?.toString().trim() ? Number(param) : null),
  composers: (param) => param?.trim()?.split(', ') || [],
  conductor: (param) => param?.trim() || null,
  comment: (param) => param || null,
  copyright: (param) => param?.trim() || null,
  disc: (param) => (param?.toString().trim() ? Number(param) : null),
  discCount: (param) => (param?.toString().trim() ? Number(param) : null),
  description: (param) => param?.trim() || null,
  encoder: (param) => param?.trim() || null,
  encoderSettings: (param) => param?.trim() || null,
  encodedBy: (param) => param?.trim() || null,
  genres: (param) => param?.trim()?.split(', ') || [],
  isCompilation: (param) => (param === 1 ? 1 : 0),
  like: (param) => (param === 1 ? 1 : 0),
  isrc: (param) => param?.trim() || null,
  lyrics: (param) => param?.trim() || null,
  /*  performers: (param) => param?.trim()?.split(', ') || [], */
  performers: (param) =>
    typeof param === 'string'
      ? param
          .split(/[;,]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
  performersRole: (param) => param?.trim()?.split(', ') || [],
  pictures: (param) => {
    Picture.fromFullData(
      ByteVector.fromByteArray(param.data),
      param.type ? (PictureType[param.type] ?? PictureType.FrontCover) : PictureType.FrontCover,
      param.format || 'image/jpeg',
      param.description ?? ''
    );
  },
  'picture-location': (param) => String(param),
  publisher: (param) => param?.trim() || null,
  remixedBy: (param) => param?.trim() || null,
  replayGainAlbumGain: (param) => (param?.toString().trim() ? Number(param) : null),
  replayGainAlbumPeak: (param) => (param?.toString().trim() ? Number(param) : null),
  replayGainTrackGain: (param) => (param?.toString().trim() ? Number(param) : null),
  replayGainTrackPeak: (param) => (param?.toString().trim() ? Number(param) : null),
  tagTypes: (param) => param,
  title: (param) => param?.trim() || null,
  track: (param) => (param?.toString().trim() ? Number(param) : null),
  trackCount: (param) => (param?.toString().trim() ? Number(param) : null),
  year: (param) => (param?.toString().trim() ? Number(param) : null)
};

const updateTags = async (arr) => {
  console.log('update tags, # of tags: ', arr);
  MpegAudioFileSettings.defaultTagTypes = TagTypes.Id3v2;
  FlacFileSettings.defaultTagTypes = TagTypes.Xiph;
  const errors = [];

  for (const a of arr) {
    let writeState;
    try {
      writeState = await ensureWritableWithStatus(a.id);
      if (writeState.status === 'unwritable') {
        console.log('write-state first called: ', writeState.status);
        throw new Error('File is not writable');
      }

      let id3v2 = null;
      let myFile;
      try {
        myFile = File.createFromPath(a.id);
      } catch (err) {
        console.error(`File ${a.id} failed`);
      }
      if (path.extname(a.id).toLowerCase() === '.mp3') {
        sanitizeMp3Picture(myFile);
        myFile.save();
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
      console.log(
        'sending to extraneousTags from inpsectTags: ',
        info.fileType,
        '--',
        info.typesList
      );
      const removeMask = await extraneousTags(info.fileType, info.typesList);

      if (removeMask) {
        console.log('remove mask: ', removeMask);
        if (removeMask === 2 && path.extname(a.id).toLowerCase() === '.mp3' && id3v2) {
          const id3v1 = myFile.getTag(TagTypes.Id3v1, false);
          /* const id3v2 = myFile.getTag(TagTypes.Id3v2, true); */
          id3v1.copyTo(id3v2, false);
        }
        myFile.removeTags(removeMask);
        myFile.save();
      }

      for (const [key, value] of Object.entries(allUpdates)) {
        /* console.log('a.updates ', a.updates); */
        if (key === 'picture-location') {
          if (isValidImageFile(value)) {
            const pic = Picture.fromPath(value);
            myFile.tag.pictures = [pic];
          } else {
            console.warn(`⚠️ Invalid image:`, value);
            errors.push({ track_id: a.track_id, id: a.id, error: 'Invalid image' });
          }
        } else if (key === 'pictures') {
          if (value && value.data) {
            const pic = Picture.fromFullData(
              ByteVector.fromByteArray(value.data),
              value.type ?? PictureType.FrontCover,
              value.format,
              value.description ?? ''
            );
            myFile.tag.pictures = [pic]; // <-- CORRECT
          } else {
            myFile.tag.pictures = []; // optional clear
          }
        } else {
          try {
            if (value === '-' && key === 'performersRole') {
              const perfs = myFile.tag.performers;

              /* myFile.tag[key] = deleteKeys[key](); */
              myFile.tag.performers = [];
              myFile.tag.performersRole = [];
              myFile.save();
              myFile.dispose();
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
            throw err; // rethrow if you want to stop execution
          }
        }
      }
      myFile.save();
      myFile.dispose();
    } catch (e) {
      /* console.error('🔴 Outer error caught for file:', a.id, '\n', e); */

      let errMessage;

      if (e instanceof Error) {
        errMessage = e.stack || e.message;
      } else if (typeof e === 'object' && e !== null) {
        errMessage = JSON.stringify(e);
      } else {
        errMessage = String(e);
      }

      //console.error(`Error processing file ${a.id}: ${errMessage}`);
      errors.push({ track_id: a.track_id, id: a.id, error: errMessage });
    } finally {
      if (writeState.status === 'changed-to-writable') {
        console.log('write-state finally called: ', writeState.status);
        await restoreReadOnlyWindows(a.id);
      }
    }
  }

  return { message: 'Tag updates completed with some errors', errors };
};

export default updateTags;
