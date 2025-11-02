import fs from 'fs';
import path from 'path';

function simulateDBCorruption() {
  const dbDir = path.join(process.cwd(), 'src/db');
  const mainDB = path.join(dbDir, 'music.db');
  const backupDB = path.join(dbDir, `music-db-before-test-${Date.now()}.db`);
  const corruptDB = path.join(dbDir, 'music-corrupt-temp.db');

  console.log(`\n🧪 Simulating DB corruption...\n`);

  // 1) Safety backup of real DB
  if (fs.existsSync(mainDB)) {
    fs.copyFileSync(mainDB, backupDB);
    console.log(`✅ Backup saved → ${backupDB}`);
  }

  // 2) Copy DB to temp corrupt file
  fs.copyFileSync(mainDB, corruptDB);

  // 3) Corrupt the copy by truncating it
  const fd = fs.openSync(corruptDB, 'r+');
  fs.ftruncateSync(fd, 1024); // smash file to 1KB
  fs.closeSync(fd);
  console.log(`💥 DB corrupted: ${corruptDB}`);

  // 4) Rename original DB out of the way
  const renamed = path.join(dbDir, `music.db.original-under-test-${Date.now()}.db`);
  fs.renameSync(mainDB, renamed);
  console.log(`👉 Original DB renamed → ${renamed}`);

  // 5) Replace live DB with corrupted one
  fs.renameSync(corruptDB, mainDB);
  console.log(`⚠️ Live DB replaced with corrupted version`);

  // 6) Remove WAL/SHM to force SQLite to choke properly
  ['music.db-wal', 'music.db-shm'].forEach((f) => {
    const p = path.join(dbDir, f);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      console.log(`🧹 Removed WAL/SHM → ${f}`);
    }
  });

  console.log(`\n✅ Corruption simulation complete`);
  console.log(`Restart app to trigger StartupGuard.\n`);
}

simulateDBCorruption();
