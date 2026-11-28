import path from 'node:path';

export function localFilePath(url, scheme) {
  const prefix = `${scheme}://`;
  if (typeof url !== 'string' || !url.toLowerCase().startsWith(prefix))
    throw new Error('Invalid local file URL.');
  const encoded = url.slice(prefix.length).split(/[?#]/, 1)[0];
  let file = decodeURIComponent(encoded.startsWith('local/') ? encoded.slice(6) : encoded);
  // Former Windows drive-as-host URLs lose the colon when Chromium normalizes them.
  if (/^[a-z]\//i.test(file)) file = `${file[0].toUpperCase()}:${file.slice(1)}`;
  if (!file || file.includes('\0') || (!path.isAbsolute(file) && !path.win32.isAbsolute(file)))
    throw new Error('Invalid local file path.');
  return file;
}
