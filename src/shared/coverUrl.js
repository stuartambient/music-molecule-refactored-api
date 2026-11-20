export function coverWebUrl(value) {
  if (typeof value !== 'string' || value.length > 8192)
    throw new Error('The image URL is invalid.');
  const url = new globalThis.URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Choose an HTTP or HTTPS image link without embedded credentials.');
  if (!url.hostname || url.hostname === 'localhost' || url.hostname.endsWith('.localhost'))
    throw new Error('Local computer addresses cannot be used for cover downloads.');
  return url;
}
