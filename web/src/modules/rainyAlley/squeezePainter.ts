type Bounds = {left: number; right: number; top: number; bottom: number};

/** Reuse the approved alley's wet masonry, metal edging and warm lamplight. Visuals only. */
export function paintSqueezePassage(context: CanvasRenderingContext2D, background: HTMLImageElement, bounds: Bounds, openingWidth: number) {
  if (!background.complete || !background.naturalWidth) return;
  const width = (bounds.right - bounds.left - openingWidth) / 2;
  const height = bounds.bottom - bounds.top;
  const pier = (x: number, left: boolean) => {
    // Expand only away from the passage, preserving both inner edges of the authored gap.
    const outerX = left ? x - 2 : x, visualWidth = width + 2;
    context.save();
    context.imageSmoothingEnabled = false;
    context.beginPath(); context.rect(outerX, bounds.top - 1, visualWidth, height + 2); context.clip();
    context.fillStyle = '#071622'; context.fillRect(outerX, bounds.top - 1, visualWidth, height + 2);
    // Mirror the neighbouring wall edge so both lit bevels face the narrow passage.
    // Reusing the other facade's full strip would duplicate part of its window.
    context.save();
    context.translate(left ? outerX : outerX + visualWidth, bounds.top - 1);
    if (!left) context.scale(-1, 1);
    context.drawImage(background, 627, 309, 19, 96, 0, 0, visualWidth, height + 2);
    context.restore();
    if (!left) {context.fillStyle = 'rgba(8,24,39,.14)'; context.fillRect(outerX, bounds.top, visualWidth, height);}
    // A recessed inner edge and a low stone foot tie each pier to the existing paving.
    context.fillStyle = 'rgba(3,13,23,.55)';
    context.fillRect(left ? x + width - 1 : x, bounds.top + 1, 1, height - 1);
    context.fillStyle = 'rgba(8,20,28,.55)'; context.fillRect(outerX, bounds.bottom - 2, visualWidth, 3);
    context.fillStyle = left ? 'rgba(226,174,86,.42)' : 'rgba(105,161,187,.38)';
    context.fillRect(outerX + 1, bounds.bottom - 2, visualWidth - 2, .7);
    context.restore();
  };
  pier(bounds.left, true);
  pier(bounds.right - width, false);
  context.save();
  context.imageSmoothingEnabled = false;
  // Cap only the two piers. Leave the horizontal road and the gap's original
  // PNG paving untouched, without a copied strip or a differently shaded floor.
  for (const x of [bounds.left - 2, bounds.right - width]) {
    context.drawImage(background, 553, 326, 12, 8, x, bounds.top, width + 2, 3);
  }
  context.restore();
}
