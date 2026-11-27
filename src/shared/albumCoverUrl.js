export const albumCoverUrl = (file) =>
  `cover://${encodeURI(file).replace(/[?#]/g, (character) => encodeURIComponent(character))}`;
