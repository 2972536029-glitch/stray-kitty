import {useEffect, useRef} from 'react';
export interface CanvasRuntime {destroy(): void}
interface Props {
  createRuntime: (canvas: HTMLCanvasElement) => CanvasRuntime;
  label: string;
  width?: number;
  height?: number;
}
// 通用画布挂载与释放。具体探索、战斗和家园实现由外部传入。
export function CanvasViewport({createRuntime, label, width = 800, height = 480}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const factory = useRef(createRuntime);factory.current = createRuntime;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  useEffect(() => {
    const runtime = factory.current(canvas.current!);
    return () => runtime.destroy();
  }, [width, height]);
  return <div className="game-viewport" data-renderer="canvas2d"><canvas ref={canvas} width={Math.round(width * dpr)} height={Math.round(height * dpr)} data-logical-width={width} data-logical-height={height} data-dpr={dpr} role="img" aria-label={label} tabIndex={0}/></div>;
}
