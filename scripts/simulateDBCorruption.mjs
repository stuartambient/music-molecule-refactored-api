// ESM-safe __dirname
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ALWAYS resolve relative to this script
const dbDir = path.resolve(__dirname, '../src/db');
const mainDB = path.join(dbDir, 'music.db');
const backup = path.join(dbDir, `music.db.original-under-test-${Date.now()}.db`);

function log(...args) {
  console.log('🧪', ...args);
}

function simulateDBCorruption() {
  log('Using dbDir:', dbDir);
  if (!fs.existsSync(dbDir)) throw new Error('dbDir missing: ' + dbDir);
  if (!fs.existsSync(mainDB)) throw new Error('music.db not found at: ' + mainDB);

  // 1) Move original aside first (guarantees we always leave a backup)
  fs.renameSync(mainDB, backup);
  log('Original moved →', path.basename(backup));

  // 2) Write a brand-new 1KB corrupted DB at the correct path
  //    (avoid temp files and cross-folder renames entirely)
  fs.writeFileSync(mainDB, Buffer.alloc(1024));
  log('Corrupted 1KB written →', path.basename(mainDB));

  // 3) Clean WAL/SHM
  ['music.db-wal', 'music.db-shm'].forEach((f) => {
    const p = path.join(dbDir, f);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      log('Removed sidecar →', f);
    }
  });

  // 4) Sanity log
  const size = fs.statSync(mainDB).size;
  log('Final size music.db =', size, 'bytes (expected 1024)');
  log('✅ Corruption simulation complete');
}

try {
  simulateDBCorruption();
} catch (e) {
  console.error('💥 Corruption simulation failed:', e.message);
  // Best-effort rollback if we moved the original but failed to write corrupt file
  try {
    if (!fs.existsSync(mainDB) && fs.existsSync(backup)) {
      fs.renameSync(backup, mainDB);
      console.error('↩️ Rolled back original music.db');
    }
  } catch {}
  process.exit(1);
}
