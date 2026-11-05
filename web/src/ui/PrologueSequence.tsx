import {useEffect, useRef, useState} from 'react';
import PixelCat from './PixelCat';
import {playSound} from './soundEffects';
import homeArtwork from './assets/opening/apartment-afternoon.png';
import alleyArtwork from './assets/opening/rainy-alley.png';

/** Four story beats, from the familiar afternoon home into the rainy alley.
 * Environment plates, existing animated cat and readable captions stay separate.
 * Click/Space progression, skip and completion callbacks retain their behavior.
 */
const STORY_LINES = [
  '午后的阳光落在毛毯上，一切都是熟悉的温度。',
  '直到一缕金枪鱼的香味，从纱门的缝隙钻了进来——',
  '喵喵追着那缕香味越走越远，越走越远……',
  '再回头时，家已经不见了。流浪猫王国的故事，从这里开始。'
];

const STAGE_TITLES = ['午后 · 熟悉的温度', '气味 · 门外的世界', '雨巷 · 越走越远', '相遇 · 故事开始'];

type IntroStep = {phase: 'typing' | 'waiting' | 'fading'; line: number};

export default function PrologueSequence({onComplete}: {onComplete: () => void}) {
  const [step, setStep] = useState<IntroStep>({phase: 'typing', line: 0});
  const [typed, setTyped] = useState('');

  // 逐字打印；换行时从头开始。
  useEffect(() => {
    setTyped('');
    if (step.phase === 'fading') return;
    let count = 0;
    const timer = window.setInterval(() => {
      count++;
      setTyped(STORY_LINES[step.line].slice(0, count));
      if (count >= STORY_LINES[step.line].length) {window.clearInterval(timer);setStep(prev => ({...prev, phase: 'waiting'}));}
    }, 55);
    return () => window.clearInterval(timer);
  }, [step.line, step.phase === 'fading']);

  const advance = () => {
    if (step.phase === 'typing') {           // 打字中点击 → 立即显示整行
      setTyped(STORY_LINES[step.line]);
      setStep({phase: 'waiting', line: step.line});
    } else if (step.phase === 'waiting') {   // 等待中点击 → 下一幕或收尾
      if (step.line + 1 < STORY_LINES.length) setStep({phase: 'typing', line: step.line + 1});
      else setStep({phase: 'fading', line: step.line});
    }
  };

  useEffect(() => {
    if (step.phase !== 'fading') return;
    const timer = window.setTimeout(onComplete, 650);
    return () => window.clearTimeout(timer);
  }, [step.phase, onComplete]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {if (event.key === ' ' || event.key === 'Enter') {event.preventDefault();advance();}};
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  const stage = Math.min(step.line, STORY_LINES.length - 1);
  return <div className={`prologue-overlay opening-prologue prologue-s${stage} prologue-${step.phase}`} role="presentation" onClick={advance}>
    {/* Background, native cat and captions remain independent layers. */}
    <div className="prologue-camera" aria-hidden="true">
      <div className="prologue-scene">
        <img className="prologue-plate prologue-plate-home" src={homeArtwork} alt=""/>
        <img className="prologue-plate prologue-plate-alley" src={alleyArtwork} alt=""/>
        <div className="prologue-cat"><span className="prologue-cat-bob"><PixelCat size={128}/></span></div>
        <div className="prologue-pixel-rain"/>
      </div>
    </div>
    <div className="prologue-chapter-mark" aria-hidden="true"><span>序章</span><b>{STAGE_TITLES[stage]}</b></div>
    <div className="prologue-stage" aria-live="polite">
      <span className="prologue-brand">小猫回家记 · 序章 <span>{String(stage + 1).padStart(2, '0')} / 04</span></span>
      <p className="prologue-text">{typed}{step.phase === 'typing' && <i className="prologue-caret"/>}</p>
      <div className="prologue-progress" aria-hidden="true">{STORY_LINES.map((_, index) => <i key={index} className={index <= stage ? 'is-active' : undefined}/>)}</div>
      <small className="prologue-hint">{step.line + 1 < STORY_LINES.length || step.phase === 'typing' ? '点击屏幕或按空格继续' : '点击屏幕，开始旅程'}</small>
    </div>
    <button className="prologue-skip" data-sound="close" onClick={event => {event.stopPropagation();playSound('close');setStep({phase: 'fading', line: step.line});}}>跳过序章 »</button>
  </div>;
}

/**
 * 教学高亮：半透明蒙版挖出目标区域，虚线金框呼吸提示。
 * 目标被点击（或点「知道了」）即完成，结果写入 localStorage 不再打扰。
 */
export function TutorialHighlight({selector, kicker, text, storageKey, onDone}: {selector: string; kicker: string; text: string; storageKey: string; onDone: () => void}) {
  const [rect, setRect] = useState<{left: number; top: number; width: number; height: number} | null>(null);
  const finished = useRef(false);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    try {localStorage.setItem(storageKey, 'done');} catch {/* 隐私模式下不记忆，仅本次生效 */}
    onDone();
  };

  useEffect(() => {
    const measure = () => {
      const target = document.querySelector(selector);
      if (!target) {setRect(null);return;}
      const bounds = target.getBoundingClientRect();
      // 目标被折叠/藏起（如收起的家园抽屉）时视为不存在,避免全屏遮罩罩住一个 0×0 的空窗口。
      if (bounds.width < 12 || bounds.height < 12) {setRect(null);return;}
      setRect({left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height});
    };
    measure();
    const timer = window.setInterval(measure, 300);
    window.addEventListener('resize', measure);
    return () => {window.clearInterval(timer);window.removeEventListener('resize', measure);};
  }, [selector]);

  useEffect(() => {
    const target = document.querySelector(selector);
    if (!target) return;
    target.addEventListener('click', finish, {once: true});
    return () => target.removeEventListener('click', finish);
  }, [selector, rect !== null]);

  if (!rect) return null;
  const pad = 10;
  const box = {left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2};
  return <div className="tutorial-highlight" role="presentation">
    {/* 四块蒙版围出高亮窗口 */}
    <i style={{left: 0, top: 0, width: '100%', height: Math.max(0, box.top)}}/>
    <i style={{left: 0, top: box.top + box.height, width: '100%', height: `calc(100% - ${box.top + box.height}px)`}}/>
    <i style={{left: 0, top: box.top, width: Math.max(0, box.left), height: box.height}}/>
    <i style={{left: box.left + box.width, top: box.top, width: `calc(100% - ${box.left + box.width}px)`, height: box.height}}/>
    <span className="tutorial-ring" style={box}/>
    <span className="tutorial-finger" style={{left: box.left + box.width / 2, top: box.top}} aria-hidden="true">👆</span>
    <div className="tutorial-card" style={{left: Math.min(box.left, window.innerWidth - 300), top: Math.max(12, box.top - 118)}}>
      <b>✦ {kicker}</b>
      <p>{text}</p>
      {/* 「知道了」必须同时拦下 pointerdown 与 click 的冒泡：GameScreen 的“点击外部收起顶栏”
          监听在 window pointerdown（时序早于 click），一旦放进顶栏折叠、本组件随 topbarOpen
          变 false 在 click 前卸载，finish() 就再也不会执行（done 写不进 localStorage）。 */}
      <button data-sound="close" onPointerDown={event => event.stopPropagation()} onClick={event => {event.stopPropagation();finish();}}>知道了</button>
    </div>
  </div>;
}
