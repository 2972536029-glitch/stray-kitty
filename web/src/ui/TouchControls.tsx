import {useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent} from 'react';
import type {Direction} from '../adapters/platform/input';

export type TouchAction = 'e' | 'c' | 'f' | 'q' | ' ';
interface Props {
  disabled: boolean;
  mapId: string;
  onDirection: (direction: Direction, held: boolean) => void;
  onAction: (action: TouchAction) => void;
}
const directions: Direction[] = ['up', 'down', 'left', 'right'];

/** Pointer capture keeps the stick held when a thumb leaves its circle. */
export default function TouchControls(props: Props) {
  const latest = useRef(props);latest.current = props;
  const pointer = useRef<number | null>(null);
  const held = useRef(new Set<Direction>());
  const [offset, setOffset] = useState({x: 0, y: 0});
  const release = () => {
    pointer.current = null;
    for (const direction of held.current) latest.current.onDirection(direction, false);
    held.current.clear();setOffset({x: 0, y: 0});
  };
  useEffect(() => {
    if (props.disabled) release();
  }, [props.disabled]);
  useEffect(() => {
    const visibility = () => {if (document.hidden) release();};
    const media = window.matchMedia('(any-pointer: coarse) and (orientation: landscape)');
    window.addEventListener('blur', release);
    window.addEventListener('resize', release);
    document.addEventListener('visibilitychange', visibility);
    media.addEventListener('change', release);
    return () => {
      release();window.removeEventListener('blur', release);window.removeEventListener('resize', release);
      document.removeEventListener('visibilitychange', visibility);media.removeEventListener('change', release);
    };
  }, []);
  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pointer.current !== event.pointerId || latest.current.disabled) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - bounds.left - bounds.width / 2, dy = event.clientY - bounds.top - bounds.height / 2;
    const distance = Math.hypot(dx, dy), radius = bounds.width * .32;
    setOffset({x: dx * Math.min(1, radius / (distance || 1)), y: dy * Math.min(1, radius / (distance || 1))});
    const next = new Set<Direction>();
    if (distance > 9) {
      if (dx > Math.abs(dy) * .45) next.add('right');
      if (-dx > Math.abs(dy) * .45) next.add('left');
      if (dy > Math.abs(dx) * .45) next.add('down');
      if (-dy > Math.abs(dx) * .45) next.add('up');
    }
    for (const direction of directions) if (held.current.has(direction) !== next.has(direction)) props.onDirection(direction, next.has(direction));
    held.current = next;
  };
  const actionHandlers = (action: TouchAction) => ({
    // Secondary fingers do not consistently produce a compatibility click.
    onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {event.preventDefault();if (!latest.current.disabled) latest.current.onAction(action);},
    onClick(event: ReactMouseEvent<HTMLButtonElement>) {if (event.detail === 0 && !latest.current.disabled) latest.current.onAction(action);},
  });
  return <div className="touch-controls" role="group" aria-label="触屏探索操作">
    <button type="button" className="touch-stick" aria-label="移动摇杆，按住拖动控制方向" disabled={props.disabled}
      onPointerDown={event => {
        if (pointer.current !== null) return;
        event.preventDefault();pointer.current = event.pointerId;event.currentTarget.setPointerCapture(event.pointerId);move(event);
      }} onPointerMove={move} onPointerUp={event => {if (pointer.current === event.pointerId) release();}}
      onPointerCancel={event => {if (pointer.current === event.pointerId) release();}} onLostPointerCapture={event => {if (pointer.current === event.pointerId) release();}}>
      <span className="touch-stick-arrows" aria-hidden="true">✥</span>
      <span className="touch-stick-thumb" style={{transform: `translate(${offset.x}px, ${offset.y}px)`}} aria-hidden="true">ฅ</span>
    </button>
    <div className="touch-actions">
      <div className="touch-traversal">
        {props.mapId === 'alley' && <button disabled={props.disabled} {...actionHandlers('q')}>钻缝</button>}
        {['alley', 'market', 'tunnel', 'warehouse'].includes(props.mapId) && <button disabled={props.disabled} {...actionHandlers('c')}>攀爬</button>}
        {['market', 'tunnel'].includes(props.mapId) && <button disabled={props.disabled} {...actionHandlers('f')}>下行</button>}
        {props.mapId === 'tunnel' && <button disabled={props.disabled} {...actionHandlers(' ')}>跳跃</button>}
      </div>
      <button className="touch-interact" disabled={props.disabled} {...actionHandlers('e')}><span aria-hidden="true">🐾</span>互动</button>
    </div>
  </div>;
}
