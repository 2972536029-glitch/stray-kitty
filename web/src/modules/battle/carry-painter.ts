import {getCarryPatrol, type BattleCarryState} from './carry';

/** An event-source marker, not a unit or a deployment tile. Keep the entrance arrow and label clear. */
export function paintCarryAnchor(ctx: CanvasRenderingContext2D, carry: BattleCarryState, cell: number, isMapCell: (x: number, y: number) => boolean): void {
  if (carry.id !== 'lantern' && carry.id !== 'rats' && carry.id !== 'kitten' && !(carry.id === 'box' && carry.boxActive)) return;
  const anchor = carry.id === 'rats' ? getCarryPatrol(carry).anchor : carry.anchor;
  if (!isMapCell(anchor.x, anchor.y)) return;
  ctx.save();
  ctx.translate(anchor.x * cell + cell - 25, anchor.y * cell + 9);
  // Ground the small sprite with a stepped contact shadow, not an opaque UI backplate.
  // Transparent space keeps each chapter's terrain visible around the event source.
  ctx.fillStyle = '#10272d66'; ctx.fillRect(1, 17, 16, 2); ctx.fillRect(3, 19, 12, 1);
  if (carry.id === 'lantern') {
    ctx.fillStyle = '#293c3c'; ctx.fillRect(5, 0, 7, 2); ctx.fillRect(4, 2, 2, 4); ctx.fillRect(11, 2, 2, 4);
    ctx.fillRect(1, 5, 15, 3); ctx.fillRect(2, 8, 13, 9); ctx.fillRect(1, 17, 15, 2);
    ctx.fillStyle = '#b8a071'; ctx.fillRect(6, 1, 5, 1); ctx.fillRect(2, 6, 13, 1); ctx.fillRect(2, 17, 13, 1);
    ctx.fillStyle = '#d9b65e'; ctx.fillRect(4, 8, 9, 8);
    ctx.fillStyle = '#fff0b2'; ctx.fillRect(6, 8, 5, 7);
    ctx.fillStyle = '#a38954'; ctx.fillRect(3, 8, 1, 9); ctx.fillRect(13, 8, 1, 9); ctx.fillRect(4, 16, 9, 1);
  } else if (carry.id === 'rats') {
    // A pair of friendly mice at the patrolled entrance; no enemy position is consulted.
    for (const [x,y] of [[1,3],[7,11]]) {
      ctx.fillStyle = '#10272d66'; ctx.fillRect(x,y+7,10,1);
      ctx.fillStyle = '#293c3c'; ctx.fillRect(x,y+2,10,5); ctx.fillRect(x+2,y,5,3);
      ctx.fillStyle = '#7c8b87'; ctx.fillRect(x+1,y+3,8,3); ctx.fillRect(x+3,y+1,3,2);
      ctx.fillStyle = '#c0c9b4'; ctx.fillRect(x+2,y+3,5,2); ctx.fillRect(x+3,y+1,2,1);
      ctx.fillStyle = '#d7a792'; ctx.fillRect(x+8,y+3,2,2); ctx.fillRect(x-1,y+5,3,1);
      ctx.fillStyle = '#243835'; ctx.fillRect(x+6,y+2,1,1);
    }
    ctx.fillStyle = '#38534c'; ctx.fillRect(10,2,6,3); ctx.fillRect(14,0,3,6);
    ctx.fillStyle = '#a7c3a0'; ctx.fillRect(11,2,5,1); ctx.fillRect(15,1,1,4);
  } else if (carry.id === 'kitten') {
    // Small event-source portrait only: it is not a seventh deployed combat cat.
    ctx.fillStyle = '#293c3c'; ctx.fillRect(2,1,4,7); ctx.fillRect(11,1,4,7); ctx.fillRect(2,5,13,7); ctx.fillRect(4,12,10,6);
    ctx.fillStyle = '#9f805a'; ctx.fillRect(3,2,2,5); ctx.fillRect(12,2,2,5); ctx.fillRect(3,6,11,6); ctx.fillRect(5,12,8,6);
    ctx.fillStyle = '#d5b78a'; ctx.fillRect(4,6,9,5); ctx.fillRect(6,12,6,5);
    ctx.fillStyle = '#30463d'; ctx.fillRect(5,7,2,2); ctx.fillRect(10,7,2,2);
    ctx.fillStyle = '#ead3ab'; ctx.fillRect(13,9,3,3); ctx.fillRect(4,16,3,2); ctx.fillRect(10,16,3,2);
    ctx.fillStyle = '#38534c'; ctx.fillRect(14,1,4,6); ctx.fillRect(13,2,6,4);
    ctx.fillStyle = '#a7cfc0'; ctx.fillRect(15,1,2,6); ctx.fillRect(13,3,6,2);
  } else {
    ctx.fillStyle = '#293c3c'; ctx.fillRect(0, 5, 18, 13); ctx.fillRect(1, 4, 7, 1); ctx.fillRect(10, 4, 7, 1);
    ctx.fillStyle = '#ac8960'; ctx.fillRect(2, 8, 14, 9);
    ctx.fillStyle = '#d7bc8e'; ctx.fillRect(1, 5, 7, 4); ctx.fillRect(10, 5, 7, 4);
    ctx.fillStyle = '#ebd0a0'; ctx.fillRect(1, 5, 7, 1); ctx.fillRect(10, 5, 7, 1);
    ctx.fillStyle = '#755c45'; ctx.fillRect(8, 9, 2, 8); ctx.fillRect(2, 16, 14, 1);
  }
  ctx.restore();
}
