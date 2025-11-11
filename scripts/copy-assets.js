import fs from 'fs';
import path from 'path';

const filesToCopy = [
  ['src/db', 'node_modules/electron/dist/resources'],
  ['src/db/extensions', 'node_modules/electron/dist/resources/extensions'],
  ['scripts', 'node_modules/electron/dist/resources/scripts']
  /*   ['src/db', 'node_modules/electron/dist/resources'],

  ['src/config/preferences.json', 'node_modules/electron/distout/preferences.json'],
  ['src/native', 'node_modules/electron/distout/native'] */
];

for (const [src, dest] of filesToCopy) {
  const srcPath = path.resolve(src);
  const destPath = path.resolve(dest);

  if (fs.existsSync(srcPath)) {
    fs.cpSync(srcPath, destPath, { recursive: true });
    console.log(`Copied ${srcPath} → ${destPath}`);
  } else {
    console.warn(`⚠️ Missing: ${srcPath}`);
  }
}
