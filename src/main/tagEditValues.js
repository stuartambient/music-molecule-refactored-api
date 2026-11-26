import { Picture, PictureType, ByteVector } from 'node-taglib-sharp';

export const deleteKeys = {
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

export const tagKeys = {
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
  performersRole: (param) =>
    typeof param === 'string'
      ? param
          .split(/[;,]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
  /* performersRole: (param) => param?.trim()?.split(', ') || [], */
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
