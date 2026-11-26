import path from 'node:path';
import { File } from 'node-taglib-sharp';

export async function getTrackCover(
  track,
  { getRoot, searchCover, openFile = (file) => File.createFromPath(file) }
) {
  const directory = path.dirname(track);
  const roots = getRoot(directory);
  let embedded;
  let file;
  try {
    file = await openFile(track);
    const data = file.tag.pictures?.[0]?.data;
    // Return independent bytes: no TagLib-owned data escapes the file's lifetime.
    if (data) embedded = Uint8Array.from(data);
  } finally {
    file?.dispose();
  }
  if (embedded) return embedded;

  const folderCover = await searchCover(directory);
  if (folderCover) return folderCover;
  if (roots.length > 0) {
    const cover = await searchCover(roots);
    if (cover) return cover;
  }
  return 0;
}
