import { scanPathKey } from './scanRoots.js';

const catalogs = {
  files: { table: '"audio-tracks"', path: 'audiotrack' },
  folders: { table: 'albums', path: 'fullpath' }
};

// Recheck under the write lock. Existing rows (including duplicates and user data)
// are retained; only candidates that another scan has already added are skipped.
export function commitScanChanges(db, kind, additions, missing, insert) {
  const catalog = catalogs[kind];
  if (!catalog) throw new Error('Unknown scan kind.');
  return db
    .transaction(() => {
      const existing = new Set(
        db
          .prepare(`SELECT ${catalog.path} AS path FROM ${catalog.table}`)
          .all()
          .map((row) => scanPathKey(row.path))
      );
      const added = additions.filter((row) => {
        const key = scanPathKey(row[catalog.path]);
        if (existing.has(key)) return false;
        existing.add(key);
        return true;
      });
      if (added.length) insert(added);
      const remove = db.prepare(`DELETE FROM ${catalog.table} WHERE ${catalog.path} = ?`);
      const deleted = missing.filter((file) => remove.run(file).changes > 0);
      return { added, deleted };
    })
    .immediate();
}
