// Album rows represent folders. Match a path boundary, then choose the closest
// matching folder so similarly named albums and nested discs are not confused.
const normalize = (path) => {
  const value = path.replaceAll('\\', '/').replace(/\/+$/, '');
  return /^[a-z]:\//i.test(value) || value.startsWith('//') ? value.toLowerCase() : value;
};

export function findPlayingAlbum(albums, track) {
  if (!track?.audiotrack) return null;
  const file = normalize(track.audiotrack);
  let match = null;
  let length = -1;
  for (const album of albums) {
    if (!album.fullpath) continue;
    const folder = normalize(album.fullpath);
    if (file.startsWith(folder + '/') && folder.length > length) {
      match = album;
      length = folder.length;
    }
  }
  return match;
}
