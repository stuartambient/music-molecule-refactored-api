import fs from 'node:fs';
import { TagTypes } from 'node-taglib-sharp';

export function extractMp3PictureBytes(apicFrame) {
  const lazy = apicFrame._rawPicture;
  if (!lazy) return null;

  const fd = fs.openSync(lazy._filename, 'r');
  const buffer = Buffer.alloc(lazy._streamSize);
  fs.readSync(fd, buffer, 0, lazy._streamSize, lazy._streamOffset);
  fs.closeSync(fd);

  return {
    data: buffer,
    type: lazy._type,
    format: lazy._mimeType,
    description: lazy._description ?? ''
  };
}

export function sanitizeFlacPicture(myFile) {
  try {
    const pics = myFile.tag.pictures;

    const validPictures = pics.filter((pic) => pic._data._bytes.length > 0);

    myFile.tag.pictures = validPictures || [];
  } catch (err) {
    console.log('flac error: ', err);
  }
}

export function sanitizeMp3Picture(myFile) {
  const id3v2 = myFile.getTag(TagTypes.Id3v2, false);

  if (id3v2?.pictures?.length) {
    id3v2.pictures.forEach((pic, idx) => {
      const buffer = Buffer.from(pic.data);
    });
  }

  const validPictures = id3v2.pictures.filter((pic) => pic.data && pic.data.length > 0);
  myFile.tag.pictures = validPictures || [];
  /* console.log('myFile.tag.pictures: ', myFile.tag.pictures); */
}

export function extractPictures(tag) {
  console.log('tagPictures: ', tag.pictures);
  return (tag.pictures ?? []).map((f) => {
    const raw = f._rawPicture ?? f;
    return {
      data: raw._data, // KEEP AS ByteVector
      type: raw._type,
      mimeType: raw._mimeType,
      description: raw._description
    };
  });
}
