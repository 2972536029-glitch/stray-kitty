import {useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';

interface Point {x: number; y: number}
interface Preview<CatId extends string> {
  catId: CatId; clientX: number; clientY: number; offsetX: number; offsetY: number; size: number;
}
type DrawCat<CatId extends string> = (ctx: CanvasRenderingContext2D, id: CatId, x: number, y: number, size: number) => void;

/** Keep the grabbed point under the pointer even on a fitted or scrolled board. */
export function getDragPreviewPlacement(bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  columns: number, rows: number, position: Point, clientX: number, clientY: number) {
  const width = bounds.width / columns, height = bounds.height / rows;
  return {offsetX: bounds.left + (position.x + .5) * width - clientX,
    offsetY: bounds.top + (position.y + .5) * height - clientY, size: Math.min(width, height)};
}

function CatDragPreview<CatId extends string>({preview, drawCat}: {preview: Preview<CatId>; drawCat: DrawCat<CatId>}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 80, 80); ctx.imageSmoothingEnabled = false;
    drawCat(ctx, preview.catId, 9, 7, 62);
  }, [preview.catId, drawCat]);
  return createPortal(<div data-testid="battle-drag-ghost" data-cat-id={preview.catId}
    data-client-x={preview.clientX} data-client-y={preview.clientY} aria-hidden="true"
    style={{position: 'fixed', left: preview.clientX + preview.offsetX, top: preview.clientY + preview.offsetY,
      width: preview.size, height: preview.size, transform: 'translate(-50%, -50%)', pointerEvents: 'none',
      zIndex: 10000, userSelect: 'none', filter: 'drop-shadow(0 5px 3px #10252a77)'}}>
    <canvas ref={canvas} width={80} height={80} style={{display: 'block', width: '100%', height: '100%', imageRendering: 'pixelated'}}/>
  </div>, document.body);
}

/** Presentation only: original cat positions and all drop rules remain in the
 * owning battle engine. The portal avoids clipping at the board/scroll edges. */
export function useBattleDragPreview<CatId extends string>({boardRef, columns, rows, activeCatId, drawCat}: {
  boardRef: {current: HTMLElement | null}; columns: number; rows: number;
  activeCatId: CatId | null; drawCat: DrawCat<CatId>;
}) {
  const [preview, setPreview] = useState<Preview<CatId> | null>(null);
  const snapshot = useRef<Preview<CatId> | null>(null);
  return {
    begin(catId: CatId, clientX: number, clientY: number, position: Point) {
      const bounds = boardRef.current?.getBoundingClientRect();
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
      const next = {catId, clientX, clientY, ...getDragPreviewPlacement(bounds, columns, rows, position, clientX, clientY)};
      snapshot.current = next; setPreview(next);
    },
    move(clientX: number, clientY: number) {
      const previous = snapshot.current; if (!previous) return;
      const next = {...previous, clientX, clientY}; snapshot.current = next; setPreview(next);
    },
    clear() {snapshot.current = null; setPreview(null);},
    preview: preview && activeCatId === preview.catId ? <CatDragPreview preview={preview} drawCat={drawCat}/> : null,
  };
}
