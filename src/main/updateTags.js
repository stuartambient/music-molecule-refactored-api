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
    console.log('params: ', param);
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
      //console.log('updates: ', a.updates);

      const mergedUpdates = { ...fromMM, ...(a.updates ?? {}) }; // pick ONE style and use it below

      let myFile = File.createFromPath(a.id);

      let info = await inspectTags(myFile);

      const ttod = myFile.tagTypesOnDisk;
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
      for (const [key, value] of Object.entries(mergedUpdates)) {
        console.log(key, '---', value);
        if (key === 'picture-location') {
          const pic = Picture.fromPath(value);
          myFile.tag.pictures = [pic];
        } else if (key !== 'picture-location') {
          const t = tagKeys[key](value);
          myFile.tag[key] = t;
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
