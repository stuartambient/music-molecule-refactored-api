import fs from 'node:fs/promises';
import path from 'node:path';

// List the literal directory: Unix filenames may contain glob metacharacters.
async function searchCover(folder) {
  for (const directory of Array.isArray(folder) ? folder : [folder]) {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!/\.(jpe?g|png|webp)$/i.test(entry.name)) continue;
      const file = path.join(directory, entry.name);
      try {
        if (entry.isSymbolicLink() && !(await fs.stat(file)).isFile()) continue;
        if (entry.isFile() || entry.isSymbolicLink()) return await fs.readFile(file);
      } catch (error) {
        console.error('Error reading the image:', error);
        return;
      }
    }
  }
}
export default searchCover;
