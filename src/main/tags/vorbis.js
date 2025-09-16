// vorbis.js
export const VORBIS_FIELD_MAP = {
  ALBUM: 'album',
  ALBUMARTIST: 'albumArtists',
  ARTIST: 'performers',
  BPM: 'beatPerMinute',
  COMPOSER: 'composer',
  CONDUCTOR: 'conductor',
  COMMENT: 'comment',
  COMPILATION: 'isCompilation',
  COPYRIGHT: 'copyright',
  COVERART: 'pictures',
  COVERARTMIME: 'pictures',
  DATE: 'year',
  DESCRIPTION: 'description',
  DISCNUMBER: 'disc',
  DISCTOTAL: 'discCount',
  GENRE: 'genres',
  ISRC: 'isrc',
  LYRICS: 'lyrics',
  METADATA_BLOCK_PICTURE: 'pictures', // preferred
  PERFORMER: 'performers',
  PUBLISHER: 'publisher',
  RENIXER: 'remixedBy',
  REMIXED_BY: 'remixedBy',
  TITLE: 'title',
  TRACKNUMBER: 'track',
  TRACKTOTAL: 'trackCount',
  UNSYNCEDLYRICS: 'lyrics',
  YEAR: 'year',
  PUBLISHER: 'publisher'
};

export function extractVorbisPresentFields(tags) {
  const frames = tags.Vorbis ?? [];
  const out = {};
  for (const { id, value } of frames) {
    const key = typeof id === 'string' ? id.toUpperCase() : id;
    const field = VORBIS_FIELD_MAP[key];
    if (!field || value == null || value === '') continue;
    if (field === 'year' && key === 'YEAR' && 'year' in out) continue; // prefer DATE
    if (!(field in out)) out[field] = value;
  }
  return out;
}
