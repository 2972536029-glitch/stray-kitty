import {useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode} from 'react';
import type {CatBreed} from '../adapters/canvas/pixelCat';
import PixelCat from './PixelCat';

/** 场景画布坐标（800×480 逻辑坐标）里的一个锚点。 */
export interface SceneAnchor {x: number; y: number}
type Mode = 'anchored' | 'below' | 'caption';

interface Props {
  speaker: string;
  breed?: CatBreed;
  /** 由场景实例提供：说话者头顶的画布坐标；不在场（如旁白）返回 null。 */
  getAnchor?: (breed: CatBreed) => SceneAnchor | null;
  /** 气泡绝不能遮挡的场景物件选择器（如寻猫启事 .lost-poster）。 */
  avoid?: string[];
  /** 文本/姿态变化时立即重排，不必等轮询。 */
  refreshKey?: string;
  /** 对话结束：气泡淡出缩放退场（由 DialoguePanel 在出口节点触发）。 */
  closing?: boolean;
  children: ReactNode;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * 沉浸式对话气泡（Speech Bubble）：
 * - 说话者在场景中 → 气泡锚定在角色头顶（像素阶梯小尾巴指向角色），放不下时翻到脚下；
 * - 旁白 / 说话者不在场 / 顶放脚下都放不下 → 固定为屏幕底部字幕条（旁白斜体，角色台词带说话人前缀）；
 * - 与 avoid 物件（寻猫启事等线索）矩形相交时自动降级避让，绝不遮挡；
 * - 台词带轻量说话人识别行（32px 像素头像小格 + 加粗名，旁白除外）：既有头顶位置暗示，也有明确身份标识；
 * - settled 后 left/top 走 CSS transition，锚点变化时平滑跟随角色。
 * 画布 800×480 → 屏幕像素的换算与 DemoScene.pointerdown 共用同一套 letterbox 逻辑。
 */
export default function DialogueBubble({speaker, breed, getAnchor, avoid = [], refreshKey = '', closing = false, children}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{mode: Mode; left: number; top: number; tailX: number} | null>(null);
  const [settled, setSettled] = useState(false);
  const settledRef = useRef(false);

  const place = () => {
    const el = host.current;
    if (!el) return;
    // 首次定位完成后再开启位移过渡，避免挂载时从 (0,0) 滑入。
    if (!settledRef.current) {settledRef.current = true; requestAnimationFrame(() => setSettled(true));}
    const wrap = el.closest('.world-wrap');
    const canvas = wrap?.querySelector('canvas') as HTMLCanvasElement | null;
    const anchor = breed && getAnchor ? getAnchor(breed) : null;
    // 旁白 / 说话者不在场：底部字幕条，不悬浮在画面中央。
    if (!wrap || !canvas || !anchor) {
      setPlacement(prev => (prev?.mode === 'caption' ? prev : {mode: 'caption', left: 0, top: 0, tailX: 0}));
      return;
    }
    // 画布逻辑坐标 → world-wrap 内的屏幕像素（letterbox + object-fit cover/contain）。
    const wrapRect = wrap.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const fit = getComputedStyle(canvas).objectFit === 'cover' ? Math.max : Math.min;
    const scale = fit(canvasRect.width / canvas.width, canvasRect.height / canvas.height);
    const px = canvasRect.left - wrapRect.left + (canvasRect.width - canvas.width * scale) / 2 + anchor.x * scale;
    const py = canvasRect.top - wrapRect.top + (canvasRect.height - canvas.height * scale) / 2 + anchor.y * scale;
    const width = el.offsetWidth, height = el.offsetHeight;
    const margin = 14, topSafe = 96, bottomSafe = 84;   // 顶部避开 topbar，底部避开 world-footer
    const blockers = avoid.map(selector => wrap.querySelector(selector)).filter((node): node is Element => !!node).map(node => {
      const rect = node.getBoundingClientRect();
      return {left: rect.left - wrapRect.left, top: rect.top - wrapRect.top, right: rect.right - wrapRect.left, bottom: rect.bottom - wrapRect.left};
    });
    const overlaps = (left: number, top: number) => blockers.some(block =>
      left < block.right && left + width > block.left && top < block.bottom && top + height > block.top);
    const centerX = () => clamp(px - width / 2, margin, Math.max(margin, wrapRect.width - width - margin));
    // 首选：角色头顶上方（留出尾巴的 16px）。
    let left = centerX();
    let top = py - height - 16;
    let mode: Mode = 'anchored';
    if (top < topSafe || overlaps(left, top)) {
      // 次选：角色脚下。仍放不下或还会遮挡线索 → 降级为底部字幕条。
      left = centerX();
      const below = py + 72;
      if (below + height <= wrapRect.height - bottomSafe && !overlaps(left, below)) {
        mode = 'below';
        top = below;
      } else {
        setPlacement(prev => (prev?.mode === 'caption' ? prev : {mode: 'caption', left: 0, top: 0, tailX: 0}));
        return;
      }
    }
    const tailX = clamp(px - left, 20, Math.max(20, width - 20));
    setPlacement(prev => prev && prev.mode === mode && Math.abs(prev.left - left) < .5 && Math.abs(prev.top - top) < .5 && Math.abs(prev.tailX - tailX) < .5
      ? prev
      : {mode, left, top, tailX});
  };

  useLayoutEffect(place, [refreshKey, breed, getAnchor]);
  useEffect(() => {
    // 窗口缩放、字体加载、文本高度变化都可能影响落点；轻量轮询保持跟随。
    const timer = window.setInterval(place, 350);
    window.addEventListener('resize', place);
    return () => {window.clearInterval(timer);window.removeEventListener('resize', place);};
  }, [refreshKey, breed, getAnchor]);

  const current = placement ?? {mode: 'caption' as Mode, left: 0, top: 0, tailX: 0};
  const style: CSSProperties | undefined = current.mode === 'caption'
    ? undefined
    : {left: current.left, top: current.top};
  return <div ref={host} className={`dialogue-bubble dialogue-bubble-${current.mode}${settled ? ' dialogue-bubble-settled' : ''}${closing ? ' dialogue-bubble-closing' : ''}`} data-speaker={speaker} style={style}>
    <div className="dialogue-copy">
      {/* 说话人识别行：小头像 + 加粗名（旁白不显示，保持纯字幕感；主角名走暖橙棕强调色）。 */}
      {breed && speaker !== '旁白' && (
        <div className="dialogue-who" data-main={speaker === '喵喵'}>
          <span className="dialogue-avatar" aria-hidden="true"><PixelCat breed={breed} size={32}/></span>
          <b>{speaker}</b>
        </div>
      )}
      {children}
    </div>
    {current.mode !== 'caption' && <i className="dialogue-tail" style={{left: `calc(${current.tailX}px - 8px)`}} aria-hidden="true"><b/><small/></i>}
  </div>;
}
