function decodeTagTypes(tagTypesBitmask) {
  const TagTypes = {
    Xiph: 1,
    Id3v1: 2,
    Id3v2: 4,
    Ape: 8,
    Apple: 16,
    Asf: 32,
    RiffInfo: 64,
    MovieId: 128,
    DivX: 256,
    FlacPictures: 512,
    TiffIFD: 1024,
    XMP: 2048,
    JpegComment: 4096,
    GifComment: 8192,
    Png: 16384,
    IPTCIIM: 32768,
    AudibleMetadata: 65536,
    Matroska: 131072
  };

  return (
    Object.entries(TagTypes)
      // eslint-disable-next-line no-unused-vars
      .filter(([_, bit]) => (tagTypesBitmask & bit) !== 0)
      .map(([name]) => name)
  );
}

export default decodeTagTypes;
