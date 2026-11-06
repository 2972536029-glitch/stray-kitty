/** Keep logical gameplay coordinates separate from the canvas's physical pixels. */
export function canvasResolution(width: number, height: number, cssWidth: number, cssHeight: number, dpr: number, fit: 'cover' | 'contain', native: boolean) {
  const density = Math.max(1, Number.isFinite(dpr) ? dpr : 1);
  if (!native || cssWidth <= 0 || cssHeight <= 0) return {width: Math.round(width * density), height: Math.round(height * density)};
  const scale = (fit === 'cover' ? Math.max : Math.min)(cssWidth / width, cssHeight / height) * density;
  // Preserve the exact intrinsic aspect ratio: object-fit and input projection
  // must see the same image rectangle, including after fractional window resizes.
  let a = width, b = height;
  while (b) [a, b] = [b, a % b];
  const units = Math.max(1, Math.ceil(scale * a));
  return {width: width / a * units, height: height / a * units};
}

export function alignToDevicePixel(offset: number, pixelsPerUnit: number) {
  return Math.round(offset * pixelsPerUnit) / pixelsPerUnit;
}

/** Keep the aligned artwork inside its edges without changing the camera's zoom. */
export function coveredImageOrigin(offset: number, imageSize: number, viewportSize: number, pixelsPerUnit: number) {
  if (imageSize < viewportSize) return alignToDevicePixel((viewportSize - imageSize) / 2, pixelsPerUnit);
  // Round the lower bound inward so snapping cannot expose a fractional edge.
  const minimum = Math.ceil((viewportSize - imageSize) * pixelsPerUnit) / pixelsPerUnit;
  return Math.max(minimum, Math.min(0, alignToDevicePixel(offset, pixelsPerUnit)));
}
