import fs from 'node:fs/promises';
import { Readable, Transform, pipeline } from 'node:stream';
import mime from 'mime-types';
import { localFilePath } from './localFilePath.js';

export const streamingFilePath = (url) => localFilePath(url, 'streaming');

export function audioRange(value, size) {
  if (!value || !/^bytes=/i.test(value) || value.includes(',')) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || !size) return false;
  if (!match[1]) {
    const length = Number(match[2]);
    return length > 0 ? { start: Math.max(0, size - length), end: size - 1 } : false;
  }
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return start < size && start <= end ? { start, end } : false;
}

const quietCancellation = (error) =>
  error?.name === 'AbortError' || error?.code === 'ERR_STREAM_PREMATURE_CLOSE';

export function createStreamingHandler({ open = fs.open, onError = () => {} } = {}) {
  return async function streamAudio(request) {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store'
    };
    const respond = (status, extra = {}, body = null) =>
      new globalThis.Response(body, { status, headers: { ...headers, ...extra } });
    const method = (request.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD'].includes(method)) return respond(405, { Allow: 'GET, HEAD' });
    let filePath;
    try {
      filePath = streamingFilePath(request.url);
    } catch {
      return respond(400);
    }
    let file, stream, checked;
    try {
      request.signal?.throwIfAborted();
      // Stat and read the same open file, instead of racing exists/stat/open by path.
      file = await open(filePath, 'r');
      const stat = await file.stat();
      if (!stat.isFile()) return respond(404);
      if (!Number.isSafeInteger(stat.size) || stat.size < 0)
        throw new Error('Invalid audio file size.');
      const type = mime.lookup(filePath) || 'application/octet-stream';
      // The bundled MIME database still uses the deprecated FLAC alias.
      headers['Content-Type'] = type === 'audio/x-flac' ? 'audio/flac' : type;
      const range = method === 'GET' ? audioRange(request.headers?.get('range'), stat.size) : null;
      if (range === false)
        return respond(416, { 'Content-Range': `bytes */${stat.size}`, 'Content-Length': '0' });
      const start = range?.start ?? 0;
      const end = range?.end ?? stat.size - 1;
      const length = range ? end - start + 1 : stat.size;
      const responseHeaders = {
        'Content-Length': String(length),
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${stat.size}` } : {})
      };
      if (method === 'HEAD' || !length) return respond(200, responseHeaders);
      request.signal?.throwIfAborted();
      stream = file.createReadStream({ start, end, autoClose: true, signal: request.signal });
      file = null; // The stream owns and closes the handle from here, including on cancellation.
      let delivered = 0;
      checked = new Transform({
        transform(chunk, _encoding, callback) {
          delivered += chunk.length;
          callback(null, chunk);
        },
        flush(callback) {
          callback(
            delivered === length
              ? null
              : new Error('The audio file changed while it was being read.')
          );
        }
      });
      pipeline(stream, checked, (error) => {
        if (error && !quietCancellation(error)) onError(error);
      });
      return respond(
        range ? 206 : 200,
        responseHeaders,
        Readable.toWeb(checked, {
          strategy: { highWaterMark: 64 * 1024, size: (chunk) => chunk.byteLength }
        })
      );
    } catch (error) {
      checked?.destroy();
      stream?.destroy();
      if (quietCancellation(error) || request.signal?.aborted) return respond(408);
      if (['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code)) return respond(404);
      if (['EACCES', 'EPERM'].includes(error.code)) return respond(403);
      onError(error);
      return respond(500);
    } finally {
      if (file) await file.close().catch(onError);
    }
  };
}
