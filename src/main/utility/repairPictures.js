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

/* export function extractFlacPicture(pic) {
  // Extract FLAC picture bytes (Uint8Array)
  const raw = pic?._data?._bytes;
  if (!raw || raw.length === 0) return null;

  const buffer = Buffer.from(raw);

  return {
    data: buffer,
    type: pic._type,
    format: pic._mimeType,
    description: pic._description ?? ''
  };
} */

export function sanitizeFlacPicture(myFile) {
  /* console.log('flac: ', myFile); */
  try {
    const pics = myFile.tag.pictures;
    /*  console.log('flac pictures: ', pics); */

    const validPictures = pics.filter((pic) => pic._data._bytes.length > 0);
    /* console.log('validPictures: ', validPictures); */
    myFile.tag.pictures = validPictures || [];

    /*   if (flac?.pictures?.length) {
    flac.pictures.forEach((pic, idx) => {
      console.log('Picture', idx);

      console.log('  Type:', pic.type); // e.g., FrontCover
      console.log('  Mime Type:', pic.mimeType); // e.g., "image/jpeg"
      console.log('  Description:', pic.description);
      console.log('  Filename:', pic.filename);
      console.log('  Data bytes:', pic.data.length);

      // If needed:
      const buffer = Buffer.from(pic.data);
      // save to disk:
      // fs.writeFileSync(`cover${idx}.jpg`, buffer);
    });
  }

  const validPictures = flac.pictures.filter((pic) => pic.data && pic.data.length > 0);*/
    /* console.log('valid flac pictures: ', validPictures, myFile.tag.pictures); */
  } catch (err) {
    console.log('flac error: ', err);
  }
}

// -- FINAL sanitizeTag() --
export function sanitizeMp3Picture(myFile) {
  console.log('mp3: ', myFile);
  const id3v2 = myFile.getTag(TagTypes.Id3v2, false);

  if (id3v2?.pictures?.length) {
    id3v2.pictures.forEach((pic, idx) => {
      /* console.log('Picture', idx); */

      /*  console.log('  Type:', pic.type); // e.g., FrontCover
      console.log('  Mime Type:', pic.mimeType); // e.g., "image/jpeg"
      console.log('  Description:', pic.description);
      console.log('  Filename:', pic.filename);
      console.log('  Data bytes:', pic.data.length); */

      // If needed:
      const buffer = Buffer.from(pic.data);
      // save to disk:
      // fs.writeFileSync(`cover${idx}.jpg`, buffer);
    });
  }

  const validPictures = id3v2.pictures.filter((pic) => pic.data && pic.data.length > 0);
  myFile.tag.pictures = validPictures || [];
}
