import { coverWebUrl } from '../../../shared/coverUrl.js';

export function readCoverSelection(event, frameWindow) {
  if (
    !frameWindow ||
    event.source !== frameWindow ||
    event.origin !== 'https://covers.musichoarders.xyz'
  )
    return null;
  if (typeof event.data === 'string' && event.data.length > 65536) return null;
  let data;
  try {
    data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
  } catch {
    return null;
  }
  if (!data || data.action !== 'primary' || data.type !== 'pick') return null;
  return coverWebUrl(data.bigCoverUrl).href;
}
