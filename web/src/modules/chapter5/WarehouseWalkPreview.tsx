import {useRef, useState} from 'react';
import {CanvasViewport} from '../../adapters/canvas/CanvasViewport';
import {DemoScene} from '../../examples/demo/scene';
import type {Direction} from '../../adapters/platform/input';
import './warehouse-review.css';

export default function WarehouseWalkPreview() {
  const scene = useRef<DemoScene | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  const [collision, setCollision] = useState(false), [overview, setOverview] = useState(false), [graybox, setGraybox] = useState(false);
  const move = (direction: Direction, held: boolean) => scene.current?.setDirection(direction, held);
  const focus = () => canvasRef.current?.focus({preventScroll: true});
  return <main className="warehouse-walk-review">
    <header>
      <div><h1>第五章 · 仓库美术行走对照</h1><p>WASD / 方向键移动，C 上下货架，R 回入口。<a href="http://127.0.0.1:5186/?warehouseQA=1">打开完整交互验收 →</a></p></div>
      <nav aria-label="仓库预览控制">
        <label><input type="checkbox" checked={collision} onChange={event => {setCollision(event.target.checked); scene.current?.setWarehouseReviewOptions({collision: event.target.checked}); focus();}}/>碰撞边界</label>
        <label><input type="checkbox" checked={graybox} onChange={event => {setGraybox(event.target.checked); scene.current?.setWarehouseReviewOptions({graybox: event.target.checked}); focus();}}/>灰盒对照</label>
        <label><input type="checkbox" checked={overview} onChange={event => {setOverview(event.target.checked); scene.current?.setWarehouseReviewOptions({overview: event.target.checked}); focus();}}/>全图</label>
        <button disabled={!ready} onClick={() => {scene.current?.resetWarehousePreview(); focus();}}>回到入口</button>
      </nav>
    </header>
    {error && <p className="warehouse-review-error" role="alert">{error}</p>}
    <section className="warehouse-walk-stage" aria-label="仓库行走场景">
      <CanvasViewport width={1066} height={640} label="仓库 L0，使用 WASD 或方向键移动小猫" createRuntime={canvas => {
        const runtime = new DemoScene(canvas, () => {}, () => {}, () => {});
        scene.current = runtime; canvasRef.current = canvas; runtime.start();
        void runtime.enableWarehousePreview().then(() => {if(scene.current !== runtime)return; runtime.setWarehouseReviewOptions({collision, overview, graybox}); setReady(true); focus();}).catch(cause => {if(scene.current === runtime)setError(cause instanceof Error ? cause.message : String(cause));});
        return {destroy() {scene.current = null; canvasRef.current = null; runtime.destroy();}};
      }}/>
    </section>
    <footer><span role="status">{ready ? '美术行走对照 · 灯光、事件和战斗请打开完整交互验收' : '正在准备地图…'}</span>
      <div className="warehouse-walk-directions" aria-label="移动方向">{([['up','↑'],['left','←'],['down','↓'],['right','→']] as const).map(([direction, label]) => <button key={direction} aria-label={`向${({up:'上',left:'左',down:'下',right:'右'})[direction]}移动`} onPointerDown={event => {event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); move(direction, true);}} onPointerUp={() => move(direction, false)} onPointerCancel={() => move(direction, false)} onLostPointerCapture={() => move(direction, false)}>{label}</button>)}</div>
    </footer>
  </main>;
}
