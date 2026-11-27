// A fixed authority prevents Chromium from treating a Windows drive as a host/port.
// Encode the entire path once so filename punctuation cannot become a query or fragment.
export function streamingUrl(file, token) {
  return `streaming://local/${encodeURIComponent(file)}${token ? `?playback=${encodeURIComponent(token)}` : ''}`;
}
