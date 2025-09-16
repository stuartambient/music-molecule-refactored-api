// id3v2.js

// v2.3/2.4 field map (unchanged)
export const ID3V2_FIELD_MAP = {
  TALB: 'album',
  TIT2: 'title',
  TYER: 'year',
  TDRC: 'year',
  TPE1: 'performers',
  TPE2: 'albumArtists',
  TPE3: 'conductor',
  TCOM: 'composers',
  TCON: 'genres',
  COMM: 'comment',
  USLT: 'lyrics',
  APIC: 'pictures',
  TPUB: 'publisher',
  TSRC: 'isrc',
  TCOP: 'copyright',
  TENC: 'encodedBy',
  TSSE: 'encoder'
};

// v2.2 → v2.3/2.4 normalization
const ID3V22_TO_V23 = {
  COM: 'COMM', // comment
  PIC: 'APIC', // picture
  TT2: 'TIT2', // title
  TAL: 'TALB', // album
  TP1: 'TPE1', // lead performer/artist
  TP2: 'TPE2', // band/orchestra/album artist
  TP3: 'TPE3',
  TCM: 'TCOM', // composer
  TCO: 'TCON', // genre
  TRK: 'TRCK', // track
  TPA: 'TPOS', // disc
  TYE: 'TYER', // year (v2.2)
  ULT: 'USLT', // unsynchronised lyrics
  TPB: 'TPUB', // publisher
  TRC: 'TSRC',
  TCR: 'TCOP',
  TEN: 'TENC',
  TSS: 'TSSE'
  // add more as you encounter them (e.g., TXX→TXXX, WXX→WXXX) if needed
};

const ITUN_RE = /^(iTun|iTunes_)/i;

// Normalize truthy/falsey values coming from frames (strings, numbers, objects)
export function toBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on', 't'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off', 'f'].includes(s)) return false;
  return false; // be conservative on unknown strings
}

const toText = (v) => (v && typeof v === 'object' ? (v.text ?? v.value ?? '') : (v ?? ''));

export function extractId3v2PresentFields(tags) {
  // Pull frames from 2.4, 2.3, and 2.2 (normalize 2.2 ids to 2.3 names)
  const frames24 = tags['ID3v2.4'] ?? [];
  const frames23 = tags['ID3v2.3'] ?? [];
  const frames22 = (tags['ID3v2.2'] ?? []).map(({ id, value }) => ({
    id: ID3V22_TO_V23[id] || id,
    value
  }));

  const frames = [...frames24, ...frames23, ...frames22];
  const out = {};
  const commCandidates = [];

  for (const { id, value } of frames) {
    // track/disc handling (supports both TRCK/TPOS after normalization)
    if (id === 'TRCK' || id === 'TPOS') {
      const [no, of] = String(value ?? '').split('/');
      if (id === 'TRCK') {
        if (no) out.track = no.trim();
        if (of) out.trackCount = of.trim();
      } else {
        if (no) out.disc = no.trim();
        if (of) out.discCount = of.trim();
      }
      continue;
    }

    if (id === 'TENC') {
      out.encodedBy = String(toText(value)).trim();
      continue;
    }
    if (id === 'TSSE') {
      out.encoder = String(toText(value)).trim();
      continue;
    }

    // Collect COMM/COM frames as candidates for "comment"
    if (id === 'COMM') {
      const desc =
        value && typeof value === 'object' ? (value.description ?? value.descriptor ?? '') : '';
      const txt = String(toText(value)).trim();
      commCandidates.push({ text: txt, desc: String(desc).trim() });
      continue;
    }

    if (id === 'TCMP') {
      out.isCompilation = toBool(typeof value === 'object' ? (value.text ?? value.value) : value);
      continue;
    }

    // Handle TXXX: COMPILATION
    if (id === 'TXXX') {
      const desc = value?.description ?? value?.descriptor ?? '';
      const txt = value?.text ?? value?.value ?? '';
      if (String(desc).toUpperCase() === 'COMPILATION') {
        out.isCompilation = toBool(txt);
      }
      continue;
    }

    // Regular field mapping
    const field = ID3V2_FIELD_MAP[id];
    if (!field) continue;

    // Prefer TDRC over TYER if both appear
    if (field === 'year' && id === 'TYER' && 'year' in out) continue;

    // Normalize some value shapes (lyrics often look like COMM)
    let v = value;
    if (field === 'lyrics') v = toText(value);

    if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    if (!(field in out)) out[field] = v;
  }

  // Choose a single human "comment" (ignore iTunes programmatic frames)
  if (commCandidates.length) {
    const humans = commCandidates.filter((c) => c.text && !ITUN_RE.test(c.desc));
    const picked =
      humans.find((c) => !c.desc) || // prefer empty descriptor
      humans[0] ||
      commCandidates[0];
    out.comment = picked?.text ?? '';
  }

  return out;
}
