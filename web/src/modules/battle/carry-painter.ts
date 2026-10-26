import type {BattleCarryState} from './carry';

/** An event-source marker, not a unit or a deployment tile. Keep the entrance arrow and label clear. */
export function paintCarryAnchor(ctx: CanvasRenderingContext2D, carry: BattleCarryState, cell: number, isMapCell: (x: number, y: number) => boolean): void {
  if (carry.id !== 'lantern' && !(carry.id === 'box' && carry.boxActive)) return;
  if (!isMapCell(carry.anchor.x, carry.anchor.y)) return;
  ctx.save();
  ctx.translate(carry.anchor.x * cell + cell - 25, carry.anchor.y * cell + 9);
  ctx.fillStyle = '#f6efda'; ctx.fillRect(-2, -2, 21, 22);
  if (carry.id === 'lantern') {
    ctx.strokeStyle = '#998454'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(8, 4, 4, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = '#a38b57'; ctx.fillRect(2, 5, 13, 2); ctx.fillRect(2, 17, 13, 2);
    ctx.fillStyle = '#e3bd67'; ctx.fillRect(3, 7, 11, 10);
    ctx.fillStyle = '#fff0a8'; ctx.fillRect(6, 8, 5, 7);
    ctx.strokeStyle = '#a38b57'; ctx.strokeRect(3, 7, 11, 10);
  } else {
    ctx.fillStyle = '#b4926b'; ctx.fillRect(1, 6, 16, 12);
    ctx.fillStyle = '#d7bc8e'; ctx.fillRect(1, 5, 7, 4); ctx.fillRect(10, 5, 7, 4);
    ctx.strokeStyle = '#90765a'; ctx.lineWidth = 1; ctx.strokeRect(1.5, 6.5, 15, 11);
    ctx.beginPath(); ctx.moveTo(9, 6); ctx.lineTo(9, 17); ctx.stroke();
  }
  ctx.restore();
}
