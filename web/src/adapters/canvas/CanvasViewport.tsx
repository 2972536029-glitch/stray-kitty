import {useEffect, useRef} from 'react';
import {canvasResolution} from './resolution';
export interface CanvasRuntime {destroy(): void; resize?(): void}
interface Props {
  createRuntime: (canvas: HTMLCanvasElement) => CanvasRuntime;
  label: string;
  width?: number;
  height?: number;
  nativeResolution?: boolean;
}
// 通用画布挂载与释放。具体探索、战斗和家园实现由外部传入。
export function CanvasViewport({createRuntime, label, width = 800, height = 480, nativeResolution = false}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const factory = useRef(createRuntime);factory.current = createRuntime;
  const native = useRef(nativeResolution);native.current = nativeResolution;
  const syncSize = useRef<() => void>(() => {});
  useEffect(() => {
    const element = canvas.current!;
    let runtime: CanvasRuntime | undefined;
    const resize = () => {
      const bounds = element.getBoundingClientRect();
      const fit = getComputedStyle(element).objectFit === 'cover' ? 'cover' : 'contain';
      element.dataset.dpr = String(Math.max(1, window.devicePixelRatio || 1));
      const size = canvasResolution(width, height, bounds.width, bounds.height, window.devicePixelRatio || 1, fit, native.current);
      if (element.width === size.width && element.height === size.height) return;
      element.width = size.width;element.height = size.height;
      runtime?.resize?.();
    };
    syncSize.current = resize;resize();
    runtime = factory.current(element);
    const observer = new ResizeObserver(resize);observer.observe(element);
    let densityQuery: MediaQueryList;
    const densityChanged = () => {
      densityQuery?.removeEventListener('change', densityChanged);
      densityQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      densityQuery.addEventListener('change', densityChanged);
      resize();
    };
    densityChanged();
    window.addEventListener('resize', resize);
    return () => {observer.disconnect();densityQuery.removeEventListener('change', densityChanged);window.removeEventListener('resize', resize);syncSize.current = () => {};runtime?.destroy();};
  }, [width, height]);
  useEffect(() => {syncSize.current();}, [nativeResolution]);
  return <div className="game-viewport" data-renderer="canvas2d"><canvas ref={canvas} width={width} height={height} data-logical-width={width} data-logical-height={height} data-dpr={1} data-native-resolution={nativeResolution || undefined} role="img" aria-label={label} tabIndex={0}/></div>;
}
