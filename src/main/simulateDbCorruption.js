import fs from 'fs';
import path from 'path';

export function simulateCorruption() {
  const devDB = path.join(process.cwd(), import.meta.env.MAIN_VITE_DB_PATH_DEV);
  const corruptDB = path.join(
    process.cwd(),
    import.meta.env.MAIN_VITE_DB_DIRECTORY,
    'music-corrupt-test.db'
  );

  // Copy DB first
  fs.copyFileSync(devDB, corruptDB);

  // Truncate / smash last part of file
  /*   const fd = fs.openSync(corruptDB, 'r+');
  fs.ftruncateSync(fd, 1024); // shave file to 1KB
  fs.closeSync(fd); */

  console.log('Created corrupted test DB at:', corruptDB);
}
