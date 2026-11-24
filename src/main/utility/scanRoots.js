import path from 'node:path';

function pathKey(file) {
  const resolved = path.resolve(file);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function findScanRoot(file, roots) {
  const fileKey = pathKey(file);
  return roots
    .filter((root) => {
      const relative = path.relative(pathKey(root), fileKey);
      return (
        relative &&
        relative !== '..' &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative)
      );
    })
    .sort((a, b) => pathKey(b).length - pathKey(a).length)[0];
}

export async function scanRoots(roots, listEntries) {
  const entries = new Map();
  const scannedRoots = new Set();
  const skippedRoots = [];

  for (const root of roots) {
    try {
      for (const entry of await listEntries(root)) {
        entries.set(pathKey(entry), entry);
      }
      scannedRoots.add(root);
    } catch (error) {
      skippedRoots.push({ root, error: error.message });
      console.error(`Skipping root ${root}: ${error.message}`);
    }
  }

  return {
    skippedRoots,
    compare(existingPaths) {
      const existingKeys = new Set(existingPaths.map(pathKey));
      const added = [...entries].filter(([key]) => !existingKeys.has(key)).map(([, file]) => file);
      const missing = existingPaths.filter(
        (file) => !entries.has(pathKey(file)) && scannedRoots.has(findScanRoot(file, roots))
      );
      return { added, missing };
    }
  };
}

export { pathKey as scanPathKey };
