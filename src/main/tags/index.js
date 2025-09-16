// index.js
import { extractId3v2PresentFields } from './id3v2.js';
import { extractVorbisPresentFields } from './vorbis.js';
import { extractId3v1PresentFields } from './id3v1.js';

export function extractPresentFields(tags, precedence = ['id3v2', 'vorbis', 'id3v1']) {
  const pieces = {
    id3v2: extractId3v2PresentFields(tags),
    vorbis: extractVorbisPresentFields(tags),
    id3v1: extractId3v1PresentFields(tags)
  };
  // later spreads win; put highest precedence last
  const ordered = precedence.map((k) => pieces[k]);
  const out = Object.assign({}, ...ordered);
  // optional: mirror albumArtists if missing
  if (out.albumArtists == null && out.performers != null) out.albumArtists = out.performers;
  // ignore TLEN by design; duration comes from properties
  return out;
}
