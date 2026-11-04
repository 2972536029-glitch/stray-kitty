import {useLayoutEffect, useState} from 'react';
import type {RefObject} from 'react';
import {getSkillTooltipPosition} from '../skillTooltipPosition';

interface InspectionLayoutOptions {
  inspected: {id: string; x: number; y: number} | null;
  columns: number;
  rows: number;
  overview: boolean;
  skillTooltipOpen: boolean;
  battlefieldRef: RefObject<HTMLDivElement | null>;
  boardRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
  tooltipRef: RefObject<HTMLDivElement | null>;
}

/** Keep the menu beside its cat and the description outside the board's scroll clipping. */
export function useBattleInspectionLayout({
  inspected, columns, rows, overview, skillTooltipOpen,
  battlefieldRef, boardRef, scrollRef, menuRef, tooltipRef,
}: InspectionLayoutOptions) {
  const [menuPosition, setMenuPosition] = useState({left: 0, top: 0});
  const [tooltipPosition, setTooltipPosition] = useState({left: 0, top: 0, maxHeight: 240});

  useLayoutEffect(() => {
    if (!inspected) return;
    const update = () => {
      const field = battlefieldRef.current, board = boardRef.current, scroll = scrollRef.current, menu = menuRef.current;
      if (!field || !board || !scroll || !menu) return;
      const box = field.getBoundingClientRect(), map = board.getBoundingClientRect(), view = scroll.getBoundingClientRect();
      const width = menu.offsetWidth, height = menu.offsetHeight;
      let visibleTop = 8, visibleBottom = window.innerHeight - 8;
      for (let ancestor = field.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (/auto|scroll|hidden|clip/.test(getComputedStyle(ancestor).overflowY)) {
          const clipped = ancestor.getBoundingClientRect();
          visibleTop = Math.max(visibleTop, clipped.top + 6);
          visibleBottom = Math.min(visibleBottom, clipped.bottom - 6);
        }
      }
      const cellWidth = map.width / columns, cellHeight = map.height / rows;
      const catLeft = map.left + inspected.x * cellWidth, catTop = map.top + inspected.y * cellHeight;
      const minLeft = Math.max(view.left + 5, 6);
      const maxLeft = Math.max(minLeft, Math.min(view.right - 5, window.innerWidth - 6) - width);
      const right = catLeft + cellWidth + 8, left = catLeft - width - 8;
      const preferred = right <= maxLeft ? right : left >= minLeft ? left : catLeft + cellWidth / 2 - width / 2;
      const placedLeft = Math.min(maxLeft, Math.max(minLeft, preferred));
      const overlapsCat = placedLeft < catLeft + cellWidth && placedLeft + width > catLeft;
      const preferredTop = overlapsCat ? catTop - height - 8 : catTop + cellHeight / 2 - height / 2;
      const maxTop = Math.min(view.bottom - 5, visibleBottom) - height;
      const placedTop = Math.max(visibleTop, Math.min(maxTop, preferredTop));
      setMenuPosition(previous => Math.abs(previous.left - (placedLeft - box.left)) < .5
        && Math.abs(previous.top - (placedTop - box.top)) < .5
        ? previous : {left: placedLeft - box.left, top: placedTop - box.top});
      const tooltip = tooltipRef.current;
      if (tooltip) {
        const next = getSkillTooltipPosition(field, view, {
          left: placedLeft, top: placedTop, right: placedLeft + width, bottom: placedTop + height,
        }, tooltip);
        setTooltipPosition(previous => Math.abs(previous.left - next.left) < .5
          && Math.abs(previous.top - next.top) < .5 && Math.abs(previous.maxHeight - next.maxHeight) < .5
          ? previous : next);
      }
    };
    update();
    const observer = new ResizeObserver(update);
    if (menuRef.current) observer.observe(menuRef.current);
    if (scrollRef.current) observer.observe(scrollRef.current);
    if (tooltipRef.current) observer.observe(tooltipRef.current);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [inspected?.id, inspected?.x, inspected?.y, overview, skillTooltipOpen,
    columns, rows, battlefieldRef, boardRef, scrollRef, menuRef, tooltipRef]);

  return {menuPosition, tooltipPosition};
}
