import {useEffect, useRef, useState} from 'react';
import './glass-labels.css';

export type GlassLabelKey = 'e' | 'c' | 'f' | 'q' | ' ';
const keyName = (key?: GlassLabelKey) => key === ' ' ? 'Space' : key?.toUpperCase() ?? '';

export interface GlassLabel {
  id: string;
  text: string;
  /** 仅在交互点当前可触发时存在；消失瞬间由按键锁存接管淡出。 */
  key?: GlassLabelKey;
  /** 屏幕（CSS px）坐标。 */
  x: number;
  y: number;
  alpha: number;
  objective?: boolean;
}

/** 渲染视图：guardedKey 为按键锁存期保留的上一次按键。 */
type RenderedLabel = GlassLabel & {guardedKey?: GlassLabelKey};

/** 按键锁存窗口：Q 穿过等动作触发后，角标带着旧按键淡出，杜绝「E」兜底闪变。 */
const KEY_GUARD_MS = 500;

/**
 * 四张探索地图共用的玻璃胶囊交互标签。
 * 负责 rAF 跟随、视口钳制与按键锁存；数据组装由调用方通过 getLabels 注入。
 */
export default function GlassLabels({getLabels, onAction}: {getLabels: () => GlassLabel[]; onAction: (key: GlassLabelKey) => void}) {
  const root = useRef<HTMLDivElement>(null);
  const [labels, setLabels] = useState<RenderedLabel[]>([]);
  // guards：id → 锁存按键与到期时刻；lastKeys：上一帧各标签的按键快照（含 undefined）。
  const guards = useRef(new Map<string, {key: GlassLabelKey; until: number}>());
  const lastKeys = useRef(new Map<string, GlassLabelKey | undefined>());
  useEffect(() => {
    let frame = 0, previous = '';
    const update = () => {
      const now = performance.now();
      const source = getLabels();
      const prevKeys = lastKeys.current;
      lastKeys.current = new Map(source.map(label => [label.id, label.key]));
      const current: RenderedLabel[] = source.map(label => {
        if (label.key) {guards.current.delete(label.id);return label;}
        let guard = guards.current.get(label.id);
        if (!guard && prevKeys.get(label.id)) guard = {key: prevKeys.get(label.id)!, until: now + KEY_GUARD_MS};
        if (guard && now < guard.until) {guards.current.set(label.id, guard);return {...label, guardedKey: guard.key};}
        if (guard) guards.current.delete(label.id);
        return label;
      });
      const signature = JSON.stringify(current.map(({id,text,key,guardedKey,objective}) => ({id,text,key,guardedKey,objective})));
      if (signature !== previous) {previous = signature;setLabels(current);}
      const menuBottom = document.querySelector('.fixed-game-menu')?.getBoundingClientRect().bottom ?? 64;
      const occupied: Array<{left:number;right:number;top:number;bottom:number}> = [];
      // Keep live action prompts at their anchors; nearby information yields space.
      const ordered = [...current].sort((a,b) => Number(!!b.key) - Number(!!a.key) || Number(!!b.objective) - Number(!!a.objective));
      for (const label of ordered) {
        const element = root.current?.querySelector<HTMLElement>(`[data-label="${label.id}"]`);
        if (!element) continue;
        const width = element.offsetWidth, height = element.offsetHeight;
        // 锚点只是略微越界（如出口胶囊在菜单线上方几十像素）时按钳制位置显示；
        // margin 覆盖事件点文字锚点的上抬偏移，彻底远出视口的标签才隐藏。
        const margin = 96;
        const inside = label.x > -margin && label.x < innerWidth + margin && label.y > menuBottom - margin && label.y < innerHeight + margin;
        const x = Math.max(12, Math.min(innerWidth - width - 12, label.x - width / 2));
        let y = Math.max(menuBottom + 12, Math.min(innerHeight - height - 20, label.y - height));
        if (inside && label.alpha > .01) {
          for (let attempt = 0; attempt < ordered.length; attempt++) {
            const overlap = occupied.find(rect => x < rect.right + 8 && x + width > rect.left - 8 && y < rect.bottom + 8 && y + height > rect.top - 8);
            if (!overlap) break;
            y = overlap.bottom + 8;
            if (y + height > innerHeight - 20) y = Math.max(menuBottom + 12, overlap.top - height - 8);
          }
          occupied.push({left:x,right:x+width,top:y,bottom:y+height});
        }
        element.style.transform = `translate3d(${x}px,${y}px,0)`;
        element.style.opacity = String(inside ? label.alpha : 0);
        element.dataset.visible = String(inside && label.alpha > .01);
        element.setAttribute('aria-hidden', String(!inside || label.alpha < .01));
      }
      frame = requestAnimationFrame(update);
    };
    update();return () => cancelAnimationFrame(frame);
  }, [getLabels, onAction]);
  return <div className="alley-label-layer" ref={root}>{labels.map(label =>
    <div className="alley-label-anchor" key={label.id} data-label={label.id} data-visible="false">
      <button className="alley-glass-label" type="button" data-objective={label.objective || undefined}
        disabled={!label.key} tabIndex={label.key ? 0 : -1}
        aria-label={label.key ? `${label.text}（${keyName(label.key)}）` : label.text}
        onPointerMove={event => {
          const bounds = event.currentTarget.getBoundingClientRect();
          event.currentTarget.style.setProperty('--glass-light-x', `${(event.clientX - bounds.left) / bounds.width * 100}%`);
        }}
        onPointerLeave={event => event.currentTarget.style.removeProperty('--glass-light-x')}
        onClick={() => label.key && onAction(label.key)}>
        {label.objective && <span className="alley-objective-light" aria-hidden="true"/>}
        <span className="alley-label-text">{label.text}</span>
        <span className="alley-shortcut" data-active={!!label.key} aria-hidden={!label.key}>
          {/* 锁存期内显示旧按键随胶囊一起收起；无按键时留空，绝不回退成「E」。 */}
          <span><kbd>{keyName(label.key ?? label.guardedKey)}</kbd></span>
        </span>
      </button>
    </div>
  )}</div>;
}
