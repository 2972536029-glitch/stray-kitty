import {getCarryPatrol, type BattleCarryState} from './carry';

/** An event-source marker, not a unit or a deployment tile. Keep the entrance arrow and label clear. */
export function paintCarryAnchor(ctx: CanvasRenderingContext2D, carry: BattleCarryState, cell: number, isMapCell: (x: number, y: number) => boolean): void {
  if (carry.id !== 'lantern' && carry.id !== 'rats' && carry.id !== 'kitten' && !(carry.id === 'box' && carry.boxActive)) return;
  const anchor = carry.id === 'rats' ? getCarryPatrol(carry).anchor : carry.anchor;
  if (!isMapCell(anchor.x, anchor.y)) return;
  ctx.save();
  ctx.translate(anchor.x * cell + cell - 25, anchor.y * cell + 9);
  ctx.fillStyle = '#f6efda'; ctx.fillRect(-2, -2, 21, 22);
  if (carry.id === 'lantern') {
    ctx.strokeStyle = '#998454'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(8, 4, 4, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = '#a38b57'; ctx.fillRect(2, 5, 13, 2); ctx.fillRect(2, 17, 13, 2);
    ctx.fillStyle = '#e3bd67'; ctx.fillRect(3, 7, 11, 10);
    ctx.fillStyle = '#fff0a8'; ctx.fillRect(6, 8, 5, 7);
    ctx.strokeStyle = '#a38b57'; ctx.strokeRect(3, 7, 11, 10);
  } else if (carry.id === 'rats') {
    // A pair of friendly mice at the patrolled entrance; no enemy position is consulted.
    for (const [x,y] of [[1,3],[7,11]]) {
      ctx.fillStyle = '#566268'; ctx.fillRect(x+1,y+2,8,5); ctx.fillRect(x+3,y,3,3);
      ctx.fillStyle = '#a8b0a1'; ctx.fillRect(x+2,y+3,5,3);
      ctx.fillStyle = '#ce9b8b'; ctx.fillRect(x+8,y+3,2,2); ctx.fillRect(x-1,y+5,3,1);
      ctx.fillStyle = '#2c403a'; ctx.fillRect(x+6,y+2,1,1);
    }
    ctx.fillStyle = '#69846b'; ctx.fillRect(11,2,5,2); ctx.fillRect(14,1,2,4);
  } else if (carry.id === 'kitten') {
    // Small event-source portrait only: it is not a seventh deployed combat cat.
    ctx.fillStyle = '#866b4d'; ctx.fillRect(3,1,3,6); ctx.fillRect(11,1,3,6); ctx.fillRect(3,5,11,7); ctx.fillRect(5,12,8,6);
    ctx.fillStyle = '#d5b78a'; ctx.fillRect(4,6,9,5); ctx.fillRect(6,12,6,5);
    ctx.fillStyle = '#30463d'; ctx.fillRect(5,7,2,2); ctx.fillRect(10,7,2,2);
    ctx.fillStyle = '#e2c9a0'; ctx.fillRect(13,9,3,3); ctx.fillRect(4,16,3,2); ctx.fillRect(10,16,3,2);
    ctx.fillStyle = '#72a9a1'; ctx.fillRect(15,1,2,6); ctx.fillRect(13,3,6,2);
  } else {
    ctx.fillStyle = '#b4926b'; ctx.fillRect(1, 6, 16, 12);
    ctx.fillStyle = '#d7bc8e'; ctx.fillRect(1, 5, 7, 4); ctx.fillRect(10, 5, 7, 4);
    ctx.strokeStyle = '#90765a'; ctx.lineWidth = 1; ctx.strokeRect(1.5, 6.5, 15, 11);
    ctx.beginPath(); ctx.moveTo(9, 6); ctx.lineTo(9, 17); ctx.stroke();
  }
  ctx.restore();
}
