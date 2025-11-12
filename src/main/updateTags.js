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
import { getTagInfo } from './musicMetadata.js';
import { extractPresentFields } from './tags/index.js';
import checkAndRemoveReadOnly from './utility/checkAndRemoveReadOnly';

/* const PICTURE_TYPE_MAP = {
  Other: 'Other',
  Front: 'FrontCover',
  FrontCover: 'FrontCover',
  'Cover (front)': 'FrontCover',
  0: 'Other',
  3: 'FrontCover'
}; */

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

function normalizeTagValue(key, value) {
  if (value == null) return null;
  const str = value.toString().trim();

  // handle numeric-type fields
  if (['track', 'trackCount', 'disc', 'discCount', 'year', 'beatsPerMinute', 'bpm'].includes(key)) {
    // extract first numeric part (e.g. "A1"→"1", "2018/9"→"2018")
    const match = str.match(/\d+/);
    return match ? Number(match[0]) : null;
  }

  return value; // leave all other fields unchanged
}

function safeAssignTag(myFile, key, value) {
  try {
    const converter = tagKeys[key];
    const converted = converter
      ? converter(normalizeTagValue(key, value))
      : normalizeTagValue(key, value);
    myFile.tag[key] = converted;
    return true;
  } catch (err) {
    // Retry using string fallback
    try {
      console.warn(`⚠️ TagLib rejected '${key}' (${value}) — writing as string fallback`);
      myFile.tag.setTextFrame?.(key, String(value)); // optional if TagLib supports direct text frames
      return true;
    } catch (innerErr) {
      console.error(`❌ Failed to set tag '${key}'`, innerErr.message);
      return false;
    }
  }
}

const updateTags = async (arr) => {
  console.log('update tags, # of tags: ', arr.length);
  MpegAudioFileSettings.defaultTagTypes = TagTypes.Id3v2;
  FlacFileSettings.defaultTagTypes = TagTypes.Xiph;
  const errors = [];

  for (const a of arr) {
    try {
      // 0) Access
      const ok = await checkAndRemoveReadOnly(a.id);
      if (!ok) throw new Error('File is not writable');

      // 1) Build updates (user wins; mm fills blanks)
      const mmInfo = await getTagInfo(a.id); // { warnings, tags: meta.native }

      const fromMM = extractPresentFields(mmInfo.tags); // your fn
      /* console.log('fromMM: ', fromMM); */
      /* console.log('fromMM: ', fromMM); */
      //console.log('updates: ', a.updates);

      const mergedUpdates = { ...fromMM, ...(a.updates ?? {}) }; // pick ONE style and use it below

      let myFile = File.createFromPath(a.id);

      console.log('Has v1:', !!(myFile.tagTypesOnDisk & TagTypes.Id3v1));
      console.log('Has v2:', !!(myFile.tagTypesOnDisk & TagTypes.Id3v2));

      let info = await inspectTags(myFile);

      const ttod = myFile.tagTypesOnDisk;
      console.log('ttod: ', ttod);
      if (ttod === 2) {
        const id3v1 = myFile.getTag(TagTypes.Id3v1, false);
        const id3v2 = myFile.getTag(TagTypes.Id3v2, true);
        id3v1.copyTo(id3v2, true);
        myFile.save();
      }

      info = await inspectTags(myFile);
      const removeMask = await extraneousTags(info.fileType, info.typesList);

      if (removeMask) {
        myFile.removeTags(removeMask);
        myFile.save();
      }

      //console.log('mergedUpdated: ', mergedUpdates);
      /* console.log('merged: ', mergedUpdates); */
      for (const [key, value] of Object.entries(a.updates)) {
        /* console.log('merged updates: ', mergedUpdates); */
        if (key === 'picture-location') {
          const pic = Picture.fromPath(value);
          myFile.tag.pictures = [pic];
        } else if (key !== 'picture-location') {
          /* safeAssignTag(myFile, key, value); */
          const t = tagKeys[key](value);
          myFile.tag[key] = t;
          /*  safeAssignTag(myFile, key, value); */
          /* try {
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
          } */
        }
      }
      myFile.save();
      myFile.dispose();
    } catch (e) {
      let errMessage;

      if (e instanceof Error) {
        errMessage = e.message;
      } else if (typeof e === 'object' && e !== null) {
        errMessage = JSON.stringify(e);
      } else {
        errMessage = String(e); // handles `false`, `null`, `undefined`, numbers, etc.
      }

      //console.error(`Error processing file ${a.id}: ${errMessage}`);
      errors.push({ track_id: a.track_id, id: a.id, error: errMessage });
    }
  }

  return { message: 'Tag updates completed with some errors', errors };
};

export default updateTags;
