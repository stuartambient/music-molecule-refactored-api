import axios from 'axios';
import dns from 'node:dns';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { BlockList, isIP } from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import { coverWebUrl } from '../shared/coverUrl.js';

export const COVER_MAX_BYTES = 25 * 1024 * 1024;
export const COVER_TIMEOUT_MS = 30000;
const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['192.88.99.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
])
  blocked.addSubnet(address, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [address, prefix] of [
  ['2001:db8::', 32],
  ['2001::', 32],
  ['2002::', 16]
])
  blocked.addSubnet(address, prefix, 'ipv6');

export function isPublicAddress(address) {
  const family = isIP(address);
  return family === 4
    ? !blocked.check(address, 'ipv4')
    : family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}

export function validateCoverDownloadUrl(value) {
  const url = coverWebUrl(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(hostname) ? !isPublicAddress(hostname) : !hostname.includes('.'))
    throw new Error('Cover downloads must use a public internet address.');
  return url;
}

// Validate DNS answers at connection time, including after redirects.
export function createPublicLookup(resolve = dns.lookup) {
  return (hostname, options, callback) => {
    const config = typeof options === 'object' ? options : { family: options };
    resolve(hostname, { ...config, all: true }, (error, addresses) => {
      if (error) return callback(error);
      if (!addresses?.length || addresses.some(({ address }) => !isPublicAddress(address)))
        return callback(
          new Error('The image host resolves to a local or reserved network address.')
        );
      if (config.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

function isSupportedImage(bytes) {
  return (
    bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ||
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6)) ||
    (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
  );
}

export async function downloadCoverFile(
  value,
  destination,
  {
    timeoutMs = COVER_TIMEOUT_MS,
    maxBytes = COVER_MAX_BYTES,
    client = axios,
    lookup = createPublicLookup()
  } = {}
) {
  const url = validateCoverDownloadUrl(value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const httpAgent = new HttpAgent({ lookup });
  const httpsAgent = new HttpsAgent({ lookup });
  let staging;
  try {
    const response = await client.get(url.href, {
      responseType: 'arraybuffer',
      proxy: false,
      httpAgent,
      httpsAgent,
      signal: controller.signal,
      timeout: timeoutMs,
      maxContentLength: maxBytes,
      maxRedirects: 5,
      beforeRedirect: (options) => {
        validateCoverDownloadUrl(
          `${options.protocol}//${options.hostname.includes(':') ? `[${options.hostname.replace(/^\[|\]$/g, '')}]` : options.hostname}${options.port ? ':' + options.port : ''}${options.path}`
        );
        if (options.auth) throw new Error('Image redirects cannot contain credentials.');
      },
      headers: {
        'User-Agent': 'musicplayer-electron/1.0 +https://stuartambient.github.io/musicapp-intro/'
      }
    });
    const bytes = Buffer.from(response.data);
    if (bytes.length > maxBytes)
      throw new Error('The image exceeds the cover download size limit.');
    if (response.status !== 200 || !isSupportedImage(bytes))
      throw new Error('The link did not return a supported JPEG, PNG, GIF, or WebP image.');
    if (controller.signal.aborted) throw new Error('The cover download timed out.');
    staging = await fs.mkdtemp(path.join(path.dirname(destination), '.cover-download-'));
    const staged = path.join(staging, 'image');
    await fs.writeFile(staged, bytes, { signal: controller.signal });
    if (controller.signal.aborted) throw new Error('The cover download timed out.');
    await fs.rename(staged, destination);
    return true;
  } catch (error) {
    if (controller.signal.aborted || ['ECONNABORTED', 'ETIMEDOUT'].includes(error.code))
      throw new Error('The cover download timed out. Please try again.');
    if (error.message?.includes('maxContentLength'))
      throw new Error('The image exceeds the 25 MB cover download limit.');
    throw error;
  } finally {
    clearTimeout(timer);
    httpAgent.destroy();
    httpsAgent.destroy();
    if (staging) {
      await fs.rm(path.join(staging, 'image'), { force: true }).catch(() => {});
      await fs.rmdir(staging).catch(() => {});
    }
  }
}
