import {
  Picture,
  File,
  MpegAudioFileSettings,
  FlacFileSettings,
  TagTypes,
  PictureType,
  ByteVector
} from 'node-taglib-sharp';
import { inspectTags, extraneousTags } from './tag-inspector.js';
import checkAndRemoveReadOnly from './utility/checkAndRemoveReadOnly';
import { isValidImageFile, findBadFrames, extractMetadata } from './utility/utils.js';

function cleanObject(obj) {
  /* console.log('clearObject: ', obj); */
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => {
      if (v == null) return false; // null or undefined
      if (typeof v === 'number' && Number.isNaN(v)) return false;
      if (typeof v === 'string' && v.trim() === '') return false;
      if (Array.isArray(v) && v.length === 0) return false;
      if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) return false;

      return true; // keep
    })
  );
}

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
  performers: (param) => param?.trim()?.split(', ') || [],
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
  /* console.log('update tags, # of tags: ', arr); */
  MpegAudioFileSettings.defaultTagTypes = TagTypes.Id3v2;
  FlacFileSettings.defaultTagTypes = TagTypes.Xiph;
  const errors = [];

  for (const a of arr) {
    try {
      const ok = await checkAndRemoveReadOnly(a.id);
      if (!ok) throw new Error('File is not writable');

      let myFile = File.createFromPath(a.id);
      let allUpdates = a.updates;

      try {
        const badFrames = findBadFrames(myFile);
        if (badFrames.length > 0) {
          console.log('track: ', a.id, 'bad frames: ', badFrames.length);
          const meta = cleanObject(extractMetadata(myFile));

          ['composers', 'genres', 'performers', 'performersRole', 'albumArtists'].forEach((k) => {
            if (Array.isArray(meta[k])) {
              meta[k] = meta[k].filter(Boolean).join(', ');
            }
          });
          if (Array.isArray(meta.pictures) && meta.pictures[0]) {
            const p = meta.pictures[0];
            meta.pictures = {
              data: p.data.toByteArray(),
              type: p.type,
              format: p.mimeType,
              description: p.description ?? ''
            };
          } else {
            delete meta.pictures; // no assignment, just delete
          }
          /* console.log('meta: ', meta); */
          allUpdates = { ...meta, ...a.updates };

          /* console.log('all updates: ', allUpdates); */
          myFile.removeTags(4294967295);
          myFile.save();
          myFile.dispose();

          myFile = File.createFromPath(a.id);
        }
      } catch (err) {
        console.error('badFrames Error: ', err);
      }

      /* console.log('Has v1:', !!(myFile.tagTypesOnDisk & TagTypes.Id3v1));
      console.log('Has v2:', !!(myFile.tagTypesOnDisk & TagTypes.Id3v2));
 */
      const ttod = myFile.tagTypesOnDisk;

      if (ttod === 2) {
        const id3v1 = myFile.getTag(TagTypes.Id3v1, false);
        const id3v2 = myFile.getTag(TagTypes.Id3v2, true);
        id3v1.copyTo(id3v2, true);
        myFile.save();
      }

      let info = await inspectTags(myFile);
      const removeMask = await extraneousTags(info.fileType, info.typesList);

      if (removeMask) {
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
            const t = tagKeys[key](value);
            myFile.tag[key] = t;
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
      console.error('🔴 Outer error caught for file:', a.id, '\n', e);

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
    }
  }

  return { message: 'Tag updates completed with some errors', errors };
};

export default updateTags;
