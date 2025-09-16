/**
 * Normalize a raw artist string by splitting on various delimiters,
 * trimming whitespace, and removing any numeric prefixes.
 *
 * @param {string} rawStr - The raw artist string.
 * @returns {string[]} - The list of normalized artist names.
 */
export default function normalizeArtistNames(rawStr) {
  if (!rawStr) return [];
  // Split on various common delimiters with optional surrounding whitespace.
  // The regex matches: "and", "&", "/", ",", ";" (case insensitive)
  const splitRegex = /\s*(?:and|&|\/|,|;)\s*/i;
  return rawStr
    .split(splitRegex)
    .filter((name) => name.trim().length > 0)
    .map((name) =>
      // Remove leading numbers (if any) and extra spaces
      name.replace(/^\d+\s*/, '').trim()
    );
}
