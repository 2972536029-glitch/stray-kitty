interface Position {x: number; y: number}

/** Move only the range origin. The simulation cat stays on its committed tile. */
export function getDragRangeCat<Cat extends Position & {id: string}>(
  cat: Cat | undefined,
  dragging: string | null | undefined,
  target: Position | null,
  canPlace: (cat: Cat, target: Position) => boolean,
): Cat | undefined {
  if (!cat || cat.id !== dragging) return cat;
  return target && canPlace(cat, target) ? {...cat, x: target.x, y: target.y} : undefined;
}
