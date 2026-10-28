import {useEffect, useRef, useState} from 'react';
import PixelCat from './PixelCat';
import {playSound} from './soundEffects';

/**
 * 序章电影化过场（多阶段小动画，阶段与台词一一对应）：
 *   阶段一 黑屏渐亮：夜色从黑纱里透出微光，打字机浮出台词（prologue-dawn 抬起）；
 *   阶段二 场景苏醒：楼影、路灯、水洼带着错峰延迟淡入平移，雨丝开始飘落；
 *   阶段三 主角入镜：喵喵以像素步态（两帧上下颠簸）从画面左侧走进中间，镜头缓缓推近；
 *   阶段四 尾声：夜色最浓，提示“点击屏幕，开始旅程”，点击后整幕淡出，衔接守护教学。
 * 点击/空格推进（打字中点击先补全整行）；动画全部走 CSS 过渡，柔和的时长与缓动集中在 styles.css。
 */
const STORY_LINES = [
  '午后的阳光落在毛毯上，一切都是熟悉的温度。',
  '直到一缕金枪鱼的香味，从纱门的缝隙钻了进来——',
  '喵喵追着那缕香味越走越远，越走越远……',
  '再回头时，家已经不见了。流浪猫王国的故事，从这里开始。'
];

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
  return <div className={`prologue-overlay prologue-s${stage} prologue-${step.phase}`} role="presentation" onClick={advance}>
    {/* 镜头层：阶段三起缓缓推近（scale），字幕与跳过按钮固定在镜头外 */}
    <div className="prologue-camera" aria-hidden="true">
      <div className="prologue-scene">
        <div className="prologue-sky"/>
        <svg className="prologue-buildings" viewBox="0 0 200 64" preserveAspectRatio="none" shapeRendering="crispEdges">
          <rect x="4" y="18" width="26" height="46" fill="#1c2f33"/><rect x="32" y="28" width="20" height="36" fill="#22383c"/>
          <rect x="54" y="10" width="30" height="54" fill="#182a2e"/><rect x="88" y="24" width="22" height="40" fill="#20353a"/>
          <rect x="114" y="16" width="28" height="48" fill="#1a2d31"/><rect x="146" y="30" width="24" height="34" fill="#22383c"/>
          <rect x="172" y="22" width="22" height="42" fill="#182a2e"/>
          <rect x="10" y="26" width="3" height="3" fill="#e8c473"/><rect x="20" y="38" width="3" height="3" fill="#e8c473" opacity=".7"/>
          <rect x="62" y="20" width="3" height="3" fill="#e8c473"/><rect x="74" y="34" width="3" height="3" fill="#e8c473" opacity=".6"/>
          <rect x="120" y="26" width="3" height="3" fill="#e8c473" opacity=".8"/><rect x="154" y="40" width="3" height="3" fill="#e8c473"/>
          <rect x="180" y="30" width="3" height="3" fill="#e8c473" opacity=".6"/>
        </svg>
        <div className="prologue-ground"/>
        <div className="prologue-lamp">
          <i className="prologue-lamp-glow"/>
          <svg viewBox="0 0 24 64" shapeRendering="crispEdges">
            <rect x="10" y="5" width="4" height="3" fill="#ffe1a0"/><rect x="11" y="6" width="2" height="1" fill="#fff8dd"/>
            <rect x="7" y="8" width="10" height="3" fill="#2f4247"/><rect x="7" y="8" width="10" height="1" fill="#47606a"/>
            <rect x="9" y="11" width="6" height="2" fill="#3a4a4e"/>
            <rect x="10" y="13" width="4" height="46" fill="#3a4a4e"/><rect x="10" y="13" width="1" height="46" fill="#5a7076"/>
            <rect x="6" y="59" width="12" height="3" fill="#2b3a3e"/><rect x="6" y="59" width="12" height="1" fill="#42585c"/>
          </svg>
        </div>
        <div className="prologue-puddle"><i/></div>
        <div className="prologue-cat"><span className="prologue-cat-bob"><PixelCat size={128}/></span></div>
        <div className="prologue-rain"/>
        <div className="prologue-night"/>
        <div className="prologue-dawn"/>
      </div>
    </div>
    <div className="prologue-stage" aria-live="polite">
      <span className="prologue-brand">小猫回家记 · 序章</span>
      <p className="prologue-text">{typed}{step.phase === 'typing' && <i className="prologue-caret"/>}</p>
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
    <div className="tutorial-card" style={{left: Math.min(box.left, window.innerWidth - 300), top: Math.max(12, box.top - 118)}}>
      <b>✦ {kicker}</b>
      <p>{text}</p>
      <button data-sound="close" onClick={finish}>知道了</button>
    </div>
  </div>;
}
