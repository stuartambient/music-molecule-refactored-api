// tag-inspector.js
import { File, TagTypes } from 'node-taglib-sharp';

export function fileType(p) {
  if (/\.flac$/i.test(p)) return 'flac';
  if (/\.(mp3|mp2)$/i.test(p)) return 'mp3';
  if (/\.(ogg|opus)$/i.test(p)) return 'ogg';
  if (/\.(m4a|mp4|aac)$/i.test(p)) return 'mp4';
  if (/\.wav$/i.test(p)) return 'wav';
  return 'unknown';
}

const FLAGS = [
  ['Id3v1', TagTypes.Id3v1],
  ['Id3v2', TagTypes.Id3v2],
  ['Ape', TagTypes.Ape],
  ['Xiph', TagTypes.Xiph], // Vorbis/FLAC comments
  ['Asf', TagTypes.Asf],
  ['Apple', TagTypes.Apple],
  ['RiffInfo', TagTypes.RiffInfo],
  ['FlacPictures', TagTypes.FlacPictures]
];

export async function inspectTags(input) {
  /* console.log('inspectTags: ', input); */
  const f = typeof input === 'string' ? await File.createFromPath(input) : input; // can accept File instance directly

  const path = typeof input === 'string' ? input : f.name;
  const kind = fileType(path);
  const mask = f.tagTypesOnDisk;

  const typesList = FLAGS.filter(([, bit]) => (mask & bit) !== 0).map(([name]) => name);

  const activeMask = FLAGS.filter(([, bit]) => (mask & bit) !== 0).reduce(
    (acc, [, bit]) => acc | bit,
    0
  );

  return {
    file: path,
    fileType: kind,
    mask, // raw bitmask from taglib
    typesList, // ["Id3v2", "Xiph"]
    activeMask // e.g. 10 (2 | 8)
  };
}

export async function extraneousTags(fileType, tags) {
  /* console.log('extraneous: ', tags); */
  let mask = 0;
  const hasId3v1 = tags.includes('Id3v1');
  const hasId3v2 = tags.includes('Id3v2');

  if (fileType === 'flac') {
    if (hasId3v1) mask |= 2; // remove Id3v1
    if (hasId3v2) mask |= 4; // remove Id3v2
  }

  if (fileType === 'mp3') {
    if (hasId3v1 && hasId3v2) {
      mask |= 2; // remove Id3v1, keep v2
    }
  }

  return mask || null; // null if nothing to remove
}
