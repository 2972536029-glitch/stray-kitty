import {useId, useLayoutEffect, useRef, useState} from 'react';
import type {CSSProperties, ReactNode, RefObject} from 'react';
import {createPortal} from 'react-dom';
import './tutorial.css';
import {placeTutorialCard, type TutorialBox as Box} from './tutorialCardPosition';

export interface TutorialSpotlightProps {
  containerRef: RefObject<HTMLDivElement | null>;
  phase: string;
  title: string;
  text: string;
  step: number;
  total?: number;
  sourceSelector?: string;
  targetSelector?: string;
  focusSelectors?: readonly string[];
  gesture: 'drag' | 'tap' | 'observe';
  portrait?: ReactNode;
  children?: ReactNode;
}
interface Point {x: number; y: number}
interface Layout {
  frame: Box;
  holes: Box[];
  source: Point | null;
  target: Point | null;
  targetOutside: boolean;
  card: Box;
  cardMeasured: boolean;
  cardScrollable: boolean;
}
const initialLayout: Layout = {frame: {x: 0, y: 0, width: 0, height: 0}, holes: [], source: null, target: null, targetOutside: false, card: {x: 10, y: 10, width: 500, height: 180}, cardMeasured: false, cardScrollable: false};
const rounded = (value: number) => Math.round(value * 2) / 2;
/** Visual guidance only: all game interactions still go to the real cats/cells. */
export function TutorialSpotlight({containerRef, phase, title, text, step, total = 5, sourceSelector, targetSelector, focusSelectors = [], gesture, portrait, children}: TutorialSpotlightProps) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<Layout>(initialLayout);
  const cardRef = useRef<HTMLElement>(null);
  const selectorsKey = JSON.stringify(focusSelectors);
  const observeEnergy = phase.startsWith('skill_charge');

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const container: HTMLDivElement = containerRef.current;
    setHost(container);
    let pending = 0;
    const observed = new Set<Element>();
    const resizeObserver = new ResizeObserver(schedule);
    function track(element: Element | null) {
      if (element && !observed.has(element)) {observed.add(element); resizeObserver.observe(element);}
    }
    function measure() {
      pending = 0;
      // Both visual layers stay inside the visible field, including after zoom
      // or horizontal scrolling. The playable cells keep their real handlers.
      const viewport = container.querySelector<HTMLElement>('.prologue-board-scroll') ?? container.querySelector<HTMLElement>('[data-testid="battle-board"]');
      if (!viewport) {setLayout(initialLayout); return;}
      track(container); track(viewport);
      const outer = container.getBoundingClientRect();
      const visible = viewport.getBoundingClientRect();
      const scaleX = outer.width / (container.offsetWidth || 1) || 1;
      const scaleY = outer.height / (container.offsetHeight || 1) || 1;
      const screen = window.visualViewport;
      const screenLeft = screen?.offsetLeft ?? 0, screenTop = screen?.offsetTop ?? 0;
      const left = Math.max(outer.left, visible.left, screenLeft), top = Math.max(outer.top, visible.top, screenTop);
      const right = Math.min(outer.right, visible.right, screenLeft + (screen?.width ?? window.innerWidth));
      const bottom = Math.min(outer.bottom, visible.bottom, screenTop + (screen?.height ?? window.innerHeight));
      const frame = {x: rounded((left - outer.left) / scaleX - container.clientLeft), y: rounded((top - outer.top) / scaleY - container.clientTop), width: rounded(Math.max(0, right - left) / scaleX), height: rounded(Math.max(0, bottom - top) / scaleY)};
      const nodes = new Set<Element>();
      for (const selector of [...JSON.parse(selectorsKey) as string[], sourceSelector, targetSelector]) {
        if (selector) for (const node of container.querySelectorAll(selector)) nodes.add(node);
      }
      const holes: Box[] = [];
      const boxFor = (node: Element): Box | null => {
        const box = node.getBoundingClientRect();
        if (!box.width || !box.height || getComputedStyle(node).visibility === 'hidden') return null;
        const x = Math.max(left, box.left - 6 * scaleX), y = Math.max(top, box.top - 6 * scaleY);
        const endX = Math.min(right, box.right + 6 * scaleX), endY = Math.min(bottom, box.bottom + 6 * scaleY);
        if (endX <= x || endY <= y) return null;
        return {x: rounded((x - left) / scaleX), y: rounded((y - top) / scaleY), width: rounded((endX - x) / scaleX), height: rounded((endY - y) / scaleY)};
      };
      for (const node of nodes) {track(node); const box = boxFor(node); if (box) holes.push(box);}
      const protectedBoxes: Box[] = [], secondaryBoxes: Box[] = [];
      for (const selector of [sourceSelector, targetSelector, '.btl-cat-menu', '.btl-skill-tooltip.btl-tooltip-visible', ...(observeEnergy ? ['.btl-unit'] : [])]) {
        if (selector) for (const node of container.querySelectorAll(selector)) {
          track(node); const box = boxFor(node); if (box) protectedBoxes.push(box);
        }
      }
      for (const node of container.querySelectorAll('.btl-unit')) {
        const box = boxFor(node); if (box) secondaryBoxes.push(box);
      }
      const pointFor = (selector: string | undefined): Point | null => {
        const node = selector ? container.querySelector(selector) : null;
        if (!node) return null;
        const box = node.getBoundingClientRect();
        const x = box.left + box.width / 2, y = box.top + box.height / 2;
        // Never indicate a different cell when the requested target is offscreen.
        if (!box.width || !box.height || x < left || x > right || y < top || y > bottom) return null;
        return {x: rounded((x - left) / scaleX), y: rounded((y - top) / scaleY)};
      };
      const source = pointFor(sourceSelector), target = pointFor(targetSelector);
      const board = container.querySelector<HTMLElement>('[data-testid="battle-board"]');
      track(board);
      const boardRect = board?.getBoundingClientRect();
      // The visible tiles provide the reading anchor; the whole visible field
      // remains available above/below them when a lesson must leave a cat clear.
      const boardBounds = boardRect ? {
        x: Math.max(0, (Math.max(left, boardRect.left) - left) / scaleX),
        y: Math.max(0, (Math.max(top, boardRect.top) - top) / scaleY),
        width: Math.max(1, (Math.min(right, boardRect.right) - Math.max(left, boardRect.left)) / scaleX),
        height: Math.max(1, (Math.min(bottom, boardRect.bottom) - Math.max(top, boardRect.top)) / scaleY),
      } : {x: 0, y: 0, width: frame.width, height: frame.height};
      const cardWidth = Math.min(760, Math.max(1, boardBounds.width - 24));
      const cardNode = cardRef.current;
      const copyNode = cardNode?.querySelector<HTMLElement>('.btl-tutorial-card-copy');
      const actionsNode = cardNode?.querySelector<HTMLElement>('.btl-tutorial-card-actions');
      const naturalHeight = copyNode ? copyNode.scrollHeight + (actionsNode ? actionsNode.scrollHeight + 16 : 0) + 36 : 160;
      const cardHeight = Math.max(naturalHeight, 140);
      const rawCard = placeTutorialCard(frame, boardBounds, {width: cardWidth, height: cardHeight}, protectedBoxes, secondaryBoxes);
      const card = {
        x: rounded(rawCard.x),
        y: rounded(rawCard.y),
        width: rounded(rawCard.width),
        height: rounded(rawCard.height),
      };
      const next: Layout = {frame, holes, source, target, targetOutside: !!targetSelector && !!container.querySelector(targetSelector) && !target, card, cardMeasured: !!cardRef.current, cardScrollable: cardHeight > card.height + 4};
      setLayout(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    }
    function schedule() {if (!pending) pending = requestAnimationFrame(measure);}
    const mutations = new MutationObserver(records => {
      if (records.some(record => {
        const layer = record.target instanceof Element ? record.target.closest('[data-tutorial-layer]') : null;
        // New error/actions content can grow behind max-height; ignore our own positioning attributes.
        return !layer || record.type === 'childList' && layer.classList.contains('btl-tutorial-card');
      })) schedule();
    });
    mutations.observe(container, {subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class', 'hidden']});
    measure();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(pending); resizeObserver.disconnect(); mutations.disconnect();
      window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule);
    };
  }, [containerRef, phase, sourceSelector, targetSelector, selectorsKey, host, observeEnergy]);

  const {frame, holes, source, target} = layout;
  const from = gesture === 'tap' ? target ?? source : source;
  const to = gesture === 'drag' ? target : null;
  const dragVisible = gesture === 'drag' && from && to;
  const handVisible = gesture !== 'observe' && from && (gesture !== 'drag' || to);
  const handStyle = {'--tutorial-dx': `${to && from ? to.x - from.x : 0}px`, '--tutorial-dy': `${to && from ? to.y - from.y : 0}px`} as CSSProperties;
  const distance = from && to ? Math.hypot(to.x - from.x, to.y - from.y) : 0;
  const direction = from && to && distance ? {x: (to.x - from.x) / distance, y: (to.y - from.y) / distance} : {x: 0, y: 0};
  const arrowBase = to ? {x: to.x - direction.x * 26, y: to.y - direction.y * 26} : null;

  return <>
    {host && frame.width > 0 && frame.height > 0 && createPortal(
      <><svg className={`btl-tutorial-spotlight is-${gesture}`} data-tutorial-layer="true" data-testid="battle-tutorial-spotlight" aria-hidden="true" style={{left: frame.x, top: frame.y, width: frame.width, height: frame.height}} viewBox={`0 0 ${frame.width} ${frame.height}`}>
        <defs>
          <mask id={`tutorial-mask-${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width={frame.width} height={frame.height}>
            <rect width={frame.width} height={frame.height} fill="white"/>
            {holes.map((hole, index) => <rect key={index} {...hole} rx="9" fill="black"/>)}
          </mask>
        </defs>
        {gesture !== 'observe' && <rect className="btl-tutorial-dim" width={frame.width} height={frame.height} mask={`url(#tutorial-mask-${id})`}/>}
        {holes.map((hole, index) => <rect className="btl-tutorial-ring" key={index} {...hole} rx="9"/>)}
        {dragVisible && arrowBase && distance > 35 && <g className="btl-tutorial-arrow">
          <path d={`M ${from.x + direction.x * 16} ${from.y + direction.y * 16} L ${arrowBase.x} ${arrowBase.y}`}/>
          <polygon points={`${to.x},${to.y} ${arrowBase.x - direction.y * 14},${arrowBase.y + direction.x * 14} ${arrowBase.x + direction.y * 14},${arrowBase.y - direction.x * 14}`}/>
        </g>}
        {handVisible && <g transform={`translate(${from.x} ${from.y})`}><g className={`btl-tutorial-hand is-${gesture}`} style={handStyle}>
          <circle className="btl-tutorial-touch" r="16"/>
          <g transform="translate(-5 -4) rotate(-18)"><path d="M4 4V-14Q4-19 8-19Q12-19 12-14V0Q14-6 18-3Q22-6 25-1Q30-3 32 3L31 19Q30 28 25 31H12L0 17Q-4 12 0 9Q3 7 7 12L4 4Z" fill="#fff6db" stroke="#3b574b" strokeWidth="2.5" strokeLinejoin="round"/><path d="M13 7V13M20 6V14M26 9V16" stroke="#8a9d7d" strokeWidth="2" strokeLinecap="round"/></g>
        </g></g>}
      </svg>
    <aside ref={cardRef} className="btl-tutorial-card" data-tutorial-layer="true" data-testid="battle-tutorial-card" data-tutorial-phase={phase} data-scrollable={layout.cardScrollable} aria-label="阿策的新手引导" style={{left: frame.x + layout.card.x, top: frame.y + layout.card.y, width: layout.card.width, maxHeight: layout.card.height, visibility: layout.cardMeasured ? 'visible' : 'hidden'}}>
      {portrait && <div className="btl-tutorial-portrait" aria-hidden="true">{portrait}</div>}
      <div className="btl-tutorial-card-copy" role="status" aria-live="polite" aria-atomic="true">
        <div className="btl-tutorial-kicker"><span>阿策 · 实战课堂</span><span>{step} / {total}</span></div>
        <strong>{title}</strong><p>{text}</p>
        {layout.targetOutside && <small className="btl-tutorial-scroll-hint">提示位置在画面外，左右滑动棋盘查看。</small>}
      </div>
      {children && <div className="btl-tutorial-card-actions">{children}</div>}
    </aside></>, host)}
  </>;
}
