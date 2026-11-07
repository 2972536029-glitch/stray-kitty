export interface TutorialBox {x: number; y: number; width: number; height: number}
interface Size {width: number; height: number}
const overlap = (a: TutorialBox, b: TutorialBox) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Keep the lesson near the visible board's centre, moving aside only to leave its real controls clear. */
export function placeTutorialCard(frame: Size, board: TutorialBox, size: Size, protectedBoxes: readonly TutorialBox[], secondaryBoxes: readonly TutorialBox[] = []): TutorialBox {
  const gap = 12;
  const insetX = Math.min(gap, Math.max(0, (frame.width - 1) / 2));
  const insetY = Math.min(gap, Math.max(0, (frame.height - 1) / 2));
  const width = Math.min(size.width, Math.max(1, frame.width - insetX * 2));
  const height = Math.min(size.height, Math.max(1, frame.height - insetY * 2));
  const maxX = Math.max(insetX, frame.width - width - insetX), maxY = Math.max(insetY, frame.height - height - insetY);
  const centreX = clamp(board.x + (board.width - width) / 2, insetX, maxX);
  const centreY = clamp(board.y + (board.height - height) / 2, insetY, maxY);
  const xs = [centreX, insetX, maxX];
  const ys = [centreY, insetY, maxY, board.y - height - gap, board.y + board.height + gap];
  for (const box of protectedBoxes) xs.push(box.x - width - gap, box.x + box.width + gap);
  for (const box of [...protectedBoxes, ...secondaryBoxes]) ys.push(box.y - height - gap, box.y + box.height + gap);
  let best: TutorialBox = {x: centreX, y: centreY, width, height};
  let bestScore = [Infinity, Infinity, Infinity, Infinity, Infinity];
  function consider(candidate: TutorialBox) {
    // Keep the complete lesson readable before favouring horizontal centring.
    // A clear side position is better than cropping it into a central strip.
    const score = [protectedBoxes.reduce((sum, box) => sum + overlap(candidate, box), 0),
      height - candidate.height, Math.abs(candidate.x - centreX), secondaryBoxes.reduce((sum, box) => sum + overlap(candidate, box), 0), Math.abs(candidate.y - centreY)];
    const firstDifference = score.findIndex((value, index) => value !== bestScore[index]);
    if (firstDifference >= 0 && score[firstDifference] < bestScore[firstDifference]) {best = candidate; bestScore = score;}
  }
  for (const x of xs) for (const y of ys) consider({x: clamp(x, insetX, maxX), y: clamp(y, insetY, maxY), width, height});
  // A short viewport can use a scrollable centred card in the space above/below the controls.
  if (bestScore[0] > 0) {
    const blockers = protectedBoxes.filter(box => box.x < centreX + width && box.x + box.width > centreX).sort((a, b) => a.y - b.y);
    let top = insetY;
    const considerStrip = (bottom: number) => {
      const available = Math.min(height, bottom - top);
      if (available >= Math.min(96, height)) consider({x: centreX, y: clamp(centreY, top, bottom - available), width, height: available});
    };
    for (const box of blockers) {considerStrip(Math.min(frame.height - insetY, box.y - gap)); top = Math.max(top, box.y + box.height + gap);}
    considerStrip(frame.height - insetY);
  }
  return best;
}
