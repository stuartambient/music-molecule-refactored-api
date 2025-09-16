// id3v1.js
export const ID3V1_FIELD_MAP = {
  title: 'title',
  artist: 'performers',
  album: 'album',
  year: 'year',
  comment: 'comment',
  track: 'track',
  genre: 'genres'
};

export function extractId3v1PresentFields(tags) {
  const frames = tags.ID3v1 ?? [];
  const out = {};
  for (const { id, value } of frames) {
    const field = ID3V1_FIELD_MAP[id];
    if (!field || value == null || value === '') continue;
    if (!(field in out)) out[field] = value;
  }
  return out;
}
