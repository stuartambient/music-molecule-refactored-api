import removeAccents from 'remove-accents';

const normalizeSearchText = (text) => {
  // Most catalog text is ASCII. Skip Unicode decomposition and accent mapping there.
  if (/^[\t\n\r -~]*$/.test(text)) return text.toLowerCase();
  return removeAccents(text.normalize('NFD').replace(/\p{M}/gu, '')).toLowerCase();
};

export function registerLibrarySearch(db) {
  let previousQuery;
  let words = [];
  db.function('library_search', { deterministic: true }, (value, query) => {
    // A query is constant across its result scan. Keep only that query's words,
    // and normalize each candidate once, regardless of the word count.
    if (query !== previousQuery) {
      words = [...new Set(normalizeSearchText(query).trim().split(/\s+/).filter(Boolean))];
      previousQuery = query;
    }
    if (!words.length) return 1;
    if (typeof value !== 'string') return 0;
    const candidate = normalizeSearchText(value);
    return words.every((word) => candidate.includes(word)) ? 1 : 0;
  });
}
