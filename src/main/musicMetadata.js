const mmPromise = import(/* @vite-ignore */ 'music-metadata');

export async function getTagInfo(file) {
  const mm = await mmPromise;
  const meta = await mm.parseFile(file);

  if (meta.quality.warnings.length > 0) {
    return { warnings: true, tags: meta.native };
  }
  return { warnings: false, tags: meta.native };
}
