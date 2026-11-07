import {useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent} from 'react';
import type {Direction} from '../adapters/platform/input';
import {useTouchDevice} from './MobileViewport';

export type TouchAction = 'e' | 'c' | 'f' | 'q' | ' ';
export interface TouchInteraction {key: TouchAction; label: string}
interface Props {
  disabled: boolean;
  getInteraction: () => TouchInteraction;
  onDirection: (direction: Direction, held: boolean) => void;
  onAction: (action: TouchAction) => void;
}
const directions: Direction[] = ['up', 'down', 'left', 'right'];

/** Pointer capture keeps the stick held when a thumb leaves its circle. */
export default function TouchControls(props: Props) {
  const latest = useRef(props);latest.current = props;
  const pointer = useRef<number | null>(null);
  const held = useRef(new Set<Direction>());
  const touchDevice = useTouchDevice();
  const [offset, setOffset] = useState({x: 0, y: 0});
  const [interaction, setInteraction] = useState<TouchInteraction>({key: 'e', label: '交互'});
  useEffect(() => {
    if (!touchDevice || props.disabled) return;
    let frame = 0, previous = '';
    const update = () => {
      const next = latest.current.getInteraction();
      const signature = next.key + ':' + next.label;
      if (signature !== previous) {previous = signature;setInteraction(next);}
      frame = requestAnimationFrame(update);
    };
    update();return () => cancelAnimationFrame(frame);
  }, [touchDevice, props.disabled]);
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
  const actionHandlers = {
    // Secondary fingers do not consistently produce a compatibility click.
    onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {event.preventDefault();if (!latest.current.disabled) latest.current.onAction(latest.current.getInteraction().key);},
    onClick(event: ReactMouseEvent<HTMLButtonElement>) {if (event.detail === 0 && !latest.current.disabled) latest.current.onAction(latest.current.getInteraction().key);},
  };
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
      <button type="button" className="touch-interact" aria-label={`交互：${interaction.label}`} data-action={interaction.key} disabled={props.disabled} {...actionHandlers}>
        <svg viewBox="0 0 64 64" aria-hidden="true" fill="currentColor"><ellipse cx="13" cy="24" rx="7" ry="10" transform="rotate(-25 13 24)"/><ellipse cx="27" cy="14" rx="7" ry="10"/><ellipse cx="43" cy="16" rx="7" ry="10" transform="rotate(15 43 16)"/><ellipse cx="54" cy="29" rx="6" ry="9" transform="rotate(30 54 29)"/><path d="M16 45c0-9 8-17 16-17s17 9 17 18c0 13-12 8-17 8s-16 5-16-9Z"/></svg>
      </button>
    </div>
  </div>;
}
