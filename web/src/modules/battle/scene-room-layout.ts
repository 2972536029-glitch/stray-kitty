export interface SceneRoomRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Wall feet and foreground limits, all in the caller's CSS-pixel space. */
export interface SceneRoomLayout {
  left: number;
  right: number;
  back: number;
  front: number;
  wallHeight: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const finite = (value: number, fallback: number) => Number.isFinite(value)
  ? clamp(value, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
  : fallback;

function normalizeRect(rect: SceneRoomRect, fallback: SceneRoomRect): SceneRoomRect {
  return {
    x: finite(rect?.x, fallback.x),
    y: finite(rect?.y, fallback.y),
    width: Math.max(0, finite(rect?.width, fallback.width)),
    height: Math.max(0, finite(rect?.height, fallback.height)),
  };
}

/** Surround both the board and its scrollport without moving walls into combat.
 * Offscreen limits are intentional: the camera clips the room, never its layout. */
export function getSceneRoomLayout(
  width: number,
  height: number,
  board: SceneRoomRect,
  viewport: SceneRoomRect,
  cellSize: number,
): SceneRoomLayout {
  const stage = {x: 0, y: 0, width: Math.max(0, finite(width, 0)), height: Math.max(0, finite(height, 0))};
  const view = normalizeRect(viewport, stage);
  const field = normalizeRect(board, view);
  const cell = Math.max(0, finite(cellSize, 0)) || 80;
  const gap = clamp(cell * .24, 12, 28);
  return {
    left: Math.min(field.x, view.x) - gap,
    right: Math.max(field.x + field.width, view.x + view.width) + gap,
    back: Math.min(field.y, view.y) - gap,
    front: Math.max(field.y + field.height, view.y + view.height) + gap,
    wallHeight: clamp(cell * 1.6, 88, 144),
  };
}

/** Place the complete illustration around combat's authored safe area:
 * x = 25–75%, y = 20–70%. The image follows the board when the camera scrolls. */
export function getIllustratedRoomBounds(viewWidth: number, board: SceneRoomRect): SceneRoomRect {
  const view = Math.max(0, finite(viewWidth, 0));
  const field = normalizeRect(board, {x: 0, y: 0, width: view, height: 0});
  const width = Math.max(view, field.width * 2, field.height / .3);
  const height = width * .6;
  return {
    x: field.x + field.width / 2 - width / 2,
    y: field.y - height * .2,
    width,
    height,
  };
}
