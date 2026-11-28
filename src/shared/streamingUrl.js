import { localFileUrl } from './localFileUrl.js';
// A fixed authority prevents Chromium from treating a Windows drive as a host/port.
// Encode the entire path once so filename punctuation cannot become a query or fragment.
export function streamingUrl(file, token) {
  return `${localFileUrl('streaming', file)}${token ? `?playback=${encodeURIComponent(token)}` : ''}`;
}
