import { TagTypes } from 'node-taglib-sharp';

export function dumpSemantic(myFile) {
  const t = myFile.tag; // whatever your binding returns

  // If it really is an array in this binding, pick v2 first, else v1.
  const v2 = Array.isArray(t) ? t.find((x) => x?.constructor?.name === 'Id3v2Tag') : null;
  const v1 = Array.isArray(t) ? t.find((x) => x?.constructor?.name === 'Id3v1Tag') : null;
  console.log('v1: ', v1, 'v2: ', v2);

  // TagLib “semantic” values usually live on myFile.tag (singular) in many bindings,
  // but if yours returns tag objects, we’ll just show what we can from each.

  console.log('--- ID3v1 (easy) ---');
  if (v1) {
    console.dir(
      {
        title: v1._title,
        artist: v1._artist,
        album: v1._album,
        albumArtists: v1._albumArtists,
        beatsPerMinute: v1._beatsPerMinute,
        composers: v1._composers,
        conductor: v1._conductor,
        copyright: v1._copyright,
        description: v1._description,
        disc: v1._disc,
        discCount: v1._discCount,
        isCompilation: v1._isCompilation,
        isrc: v1._isrc,
        lyrics: v1._lyrics,
        performers: v1._performers,
        performersRole: v1._performersRole,
        pictures: v1._pictures,
        publisher: v1._publisher,
        remixedBy: v1._remixedBy,
        replayGainAlbumGain: v1._,
        replayGainAlbumPeak: v1._,
        replayGainTrackGain: v1._,
        replayGainTrackPeak: v1._,
        year: v1._year,
        comment: v1._comment,
        track: v1._track,
        trackCount: v1._trackCount,
        genre: v1._genre
      },
      { depth: null }
    );
  }

  console.log('--- File-level semantic fields (preferred if exposed) ---');
  // These are the ones you actually want for “capture what exists”
  const ft = myFile.tag; // if your binding exposes properties here, they’ll show
  console.dir(
    {
      title: ft?.title,
      album: ft?.album,
      performers: ft?.performers,
      albumArtists: ft?.albumArtists,
      genres: ft?.genres,
      year: ft?.year,
      track: ft?.track,
      disc: ft?.disc,
      comment: ft?.comment,
      composers: ft?.composers,
      grouping: ft?.grouping,
      bpm: ft?.beatsPerMinute ?? ft?.bpm
    },
    { depth: null }
  );

  console.log('--- ID3v2 frame summary (diagnostic only) ---');
  if (v2?._frameList?.length) {
    console.log(v2._frameList.map((f) => f?.constructor?.name));
  }
}

function dumpId3v2Frames(myFile) {
  const id3v2 = myFile.getTag(TagTypes.Id3v2, false);
  if (!id3v2) return [];

  const frames = id3v2._frameList ?? id3v2._frameList ?? [];
  return frames.map((f) => {
    const type = f?.constructor?.name ?? 'UnknownFrame';

    // Try to get a frame id if present
    const frameId = f?._header?._frameId?.toString?.() ?? f?._header?._frameId ?? undefined;

    // Text frames often have a "text" array/property in many TagLib bindings
    const text = f?.text ?? f?._text ?? f?.fieldList ?? undefined;

    // Comments
    const comment = f?._text ?? f?.text ?? undefined;

    // UFID
    const ufidOwner = f?._owner ?? undefined;
    const ufidLen = f?._identifier?.length ?? f?._data?.length ?? undefined;

    // PRIV
    const privOwner = f?._owner ?? undefined;
    const privLen = f?._privateData?.length ?? undefined;

    // APIC / Attachment
    const pic = f?._rawPicture ?? f;
    const picMeta =
      pic?._mimeType || pic?._data
        ? {
            mime: pic?._mimeType,
            desc: pic?._description,
            picType: pic?._type,
            encoding: pic?._encoding,
            bytes: pic?._data?.length
          }
        : undefined;

    // Build a normalized row
    const row = { type, frameId };

    if (type.includes('TextInformationFrame')) row.text = text;
    if (type.includes('CommentsFrame')) row.comment = comment;
    if (type.includes('UniqueFileIdentifierFrame')) {
      row.owner = ufidOwner;
      row.bytes = ufidLen;
    }
    if (type.includes('PrivateFrame')) {
      row.owner = privOwner;
      row.bytes = privLen;
    }
    if (type.includes('AttachmentFrame')) row.picture = picMeta;

    console.log('row: ', row);
    return row;
  });
}

export default dumpId3v2Frames;
