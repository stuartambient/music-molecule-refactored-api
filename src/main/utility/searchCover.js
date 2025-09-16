import fg from 'fast-glob';

function searchCover(folder) {
  const cover = fg.sync('**/*.{jpg,jpeg,png,webp,gif}', { caseSensitiveMatch: false, cwd: folder });
  if (cover.length > 0) {
    return `${folder}/${cover[0]}`;
  }
}

export default searchCover;
