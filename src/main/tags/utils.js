export function flattenTagValue(entry) {
  if (entry == null) return '';
  if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean')
    return String(entry);
  if (Array.isArray(entry)) return entry.map(flattenTagValue).filter(Boolean).join(' | ');

  if (typeof entry === 'object') {
    // Handle ID3v2 COMM-like objects: { language?, description?/descriptor?, text?/value? }
    const desc = entry.description ?? entry.descriptor ?? '';
    const txt = entry.text ?? entry.value ?? '';
    if (txt !== '' || desc !== '') {
      return desc ? `[${String(desc).trim()}] ${String(txt)}` : String(txt);
    }
    // Fallback: compact JSON for unknown shapes
    try {
      return JSON.stringify(entry);
    } catch {
      return String(entry);
    }
  }
  return String(entry);
}

export function getEncoderFieldsFromNative(native) {
  const takeText = (v) => (v && typeof v === 'object' ? (v.text ?? v.value ?? v) : v);

  // Gather all native frames across families (ignore if missing)
  const frames = [].concat(
    native['ID3v2.4'] || [],
    native['ID3v2.3'] || [],
    native['ID3v2.2'] || [],
    native.vorbis || [],
    native.ogg || [],
    native.flac || [],
    native.iTunes || [],
    native.mp4 || []
  );

  let encoder = null; // tool, e.g. "LAME 3.100 -V0"
  let encoderSettings = null; // flags-only, if present
  let encodedBy = null; // person/org

  for (const { id, value } of frames) {
    const ID = String(id).toUpperCase();
    // ID3
    if (ID === 'TSSE' || ID === 'TSS') {
      encoder = encoder ?? String(takeText(value)).trim();
      continue;
    }
    if (ID === 'TENC' || ID === 'TEN') {
      encodedBy = encodedBy ?? String(takeText(value)).trim();
      continue;
    }
    // Xiph (FLAC/Ogg) keys arrive as ids directly
    if (ID === 'ENCODER') {
      encoder = encoder ?? String(takeText(value)).trim();
      continue;
    }
    if (ID === 'ENCODER_SETTINGS') {
      encoderSettings = encoderSettings ?? String(takeText(value)).trim();
      continue;
    }
    if (ID === 'ENCODED_BY') {
      encodedBy = encodedBy ?? String(takeText(value)).trim();
      continue;
    }
    // MP4 (iTunes)
    if (ID === '©TOO') {
      encoder = encoder ?? String(takeText(value)).trim();
      continue;
    }
    if (ID === '----:COM.APPLE.ITUNES:ENCODED_BY') {
      encodedBy = encodedBy ?? String(takeText(value)).trim();
      continue;
    }
  }

  return { encoder, encoderSettings, encodedBy };
}
