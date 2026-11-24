const scalar = (value) =>
  value === null ||
  (typeof value === 'string' && value.length <= 8192 && !value.includes('\0')) ||
  (typeof value === 'number' && Number.isFinite(value));
export function isLibraryCursor(value) {
  return (
    value === null ||
    Boolean(
      value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.getPrototypeOf(value) === Object.prototype &&
        Object.keys(value).length === 2 &&
        typeof value.scope === 'string' &&
        value.scope.length <= 16384 &&
        Array.isArray(value.key) &&
        value.key.length === 3 &&
        scalar(value.key[0]) &&
        scalar(value.key[1]) &&
        Number.isSafeInteger(value.key[2])
    )
  );
}
