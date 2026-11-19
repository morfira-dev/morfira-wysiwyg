/** Only the actual scoped visual marker supplies a pointer hit area. */
export const hitChecklistMarker = (item: HTMLElement, x: number, y: number): boolean => {
  const view = item.ownerDocument.defaultView!;
  const marker = view.getComputedStyle(item, '::before');
  if (marker.position !== 'absolute' || marker.display === 'none' || marker.visibility !== 'visible'
    || marker.opacity === '0' || marker.pointerEvents === 'none'
    || ['none', 'normal', '""', "''", ''].includes(marker.content)) return false;
  const width = Number.parseFloat(marker.width);
  const height = Number.parseFloat(marker.height);
  const top = Number.parseFloat(marker.top);
  const left = Number.parseFloat(marker.left);
  const right = Number.parseFloat(marker.right);
  if (![width, height, top].every(Number.isFinite) || width <= 0 || height <= 0
    || width > 256 || height > 256 || (!Number.isFinite(left) && !Number.isFinite(right))) return false;
  const box = item.getBoundingClientRect();
  if (box.width <= 0) return false;
  const style = view.getComputedStyle(item);
  const scaleX = item.offsetWidth ? box.width / item.offsetWidth : 1;
  const scaleY = item.offsetHeight ? box.height / item.offsetHeight : 1;
  const start = Number.isFinite(left)
    ? box.left + (Number.parseFloat(style.borderLeftWidth) + left) * scaleX
    : box.right - (Number.parseFloat(style.borderRightWidth) + right + width) * scaleX;
  const end = start + width * scaleX;
  const upper = box.top + (Number.parseFloat(style.borderTopWidth) + top) * scaleY;
  return Number.isFinite(x) && Number.isFinite(y) && x >= start && x <= end
    && y >= upper && y <= upper + height * scaleY;
};
