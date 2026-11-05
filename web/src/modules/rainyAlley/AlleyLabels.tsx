import {useEffect, useRef, useState} from 'react';
import type {DemoScene} from '../../examples/demo/scene';
import type {AlleyLabel} from './eventLabels';
import './labels.css';

/** Screen-resolution type follows world anchors without scaling with the artwork. */
export default function AlleyLabels({scene}: {scene: DemoScene}) {
  const root = useRef<HTMLDivElement>(null);
  const [labels, setLabels] = useState<AlleyLabel[]>([]);
  useEffect(() => {
    let frame = 0, previous = '';
    const update = () => {
      const current = scene.alleyExplorationLabels();
      const signature = JSON.stringify(current.map(({id,text,key,objective}) => ({id,text,key,objective})));
      if (signature !== previous) {previous = signature;setLabels(current);}
      const menuBottom = document.querySelector('.fixed-game-menu')?.getBoundingClientRect().bottom ?? 64;
      for (const label of current) {
        const element = root.current?.querySelector<HTMLElement>(`[data-label="${label.id}"]`);
        if (!element) continue;
        const width = element.offsetWidth, height = element.offsetHeight;
        const inside = label.x > 0 && label.x < innerWidth && label.y > menuBottom && label.y < innerHeight;
        const x = Math.max(12, Math.min(innerWidth - width - 12, label.x - width / 2));
        const y = Math.max(menuBottom + 12, Math.min(innerHeight - height - 20, label.y - height));
        element.style.transform = `translate3d(${x}px,${y}px,0)`;
        element.style.opacity = String(inside ? label.alpha : 0);
        element.dataset.visible = String(inside && label.alpha > .01);
        element.setAttribute('aria-hidden', String(!inside || label.alpha < .01));
      }
      frame = requestAnimationFrame(update);
    };
    update();return () => cancelAnimationFrame(frame);
  }, [scene]);
  return <div className="alley-label-layer" ref={root}>{labels.map(label =>
    <div className="alley-label-anchor" key={label.id} data-label={label.id} data-visible="false">
      <button className="alley-glass-label" type="button" data-objective={label.objective || undefined}
        disabled={!label.key} tabIndex={label.key ? 0 : -1}
        aria-label={label.key ? `${label.text}（${label.key.toUpperCase()}）` : label.text}
        onPointerMove={event => {
          const bounds = event.currentTarget.getBoundingClientRect();
          event.currentTarget.style.setProperty('--glass-light-x', `${(event.clientX - bounds.left) / bounds.width * 100}%`);
        }}
        onPointerLeave={event => event.currentTarget.style.removeProperty('--glass-light-x')}
        onClick={() => label.key && scene.performAction(label.key)}>
        {label.objective && <span className="alley-objective-light" aria-hidden="true"/>}
        <span className="alley-label-text">{label.text}</span>
        <span className="alley-shortcut" data-active={!!label.key} aria-hidden={!label.key}>
          <span><kbd>{label.key?.toUpperCase() ?? 'E'}</kbd></span>
        </span>
      </button>
    </div>
  )}</div>;
}
