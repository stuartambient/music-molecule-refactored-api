const OFFSET = 40;

export function childWindowBounds(opener, requested, workArea, occupied = []) {
  const width = Math.min(requested.width, workArea.width);
  const minimumHeight = Math.min(240, workArea.height);
  const right = workArea.x + workArea.width;
  const bottom = workArea.y + workArea.height;
  const x = Math.max(workArea.x, Math.min(opener.x + OFFSET, right - width));
  let y = Math.max(workArea.y, Math.min(opener.y + OFFSET, bottom - minimumHeight));

  // Leave a separate title-bar band for windows already occupying this area.
  while (
    occupied.some(
      (bounds) =>
        Math.abs(bounds.y - y) < OFFSET && x < bounds.x + bounds.width && x + width > bounds.x
    ) &&
    y + OFFSET <= bottom - minimumHeight
  ) {
    y += OFFSET;
  }

  return { x, y, width, height: Math.min(requested.height, bottom - y) };
}
