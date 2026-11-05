import {useEffect} from 'react';

export default function InteractionDock({target,touch,disabled,hint,onInteract}: {target:{id:string;label:string};touch:boolean;disabled:boolean;hint?:string|null;onInteract:(id:string) => void}) {
  const label = target.label.replace(/\s*·\s*[ECQF]$/,'').replace(/^[\p{Extended_Pictographic}\s]+/u,'');
  useEffect(() => {
    const inspect = (event:KeyboardEvent) => {
      const field = event.target as HTMLElement | null;
      if (event.key.toLowerCase() !== 'q' || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || disabled || document.querySelector('dialog[open]') || field?.closest('input,textarea,select,[contenteditable=true]')) return;
      // A visible discovery takes Q; elsewhere the scene keeps its passage shortcut.
      event.preventDefault();event.stopImmediatePropagation();
      if (!event.repeat) onInteract(target.id);
    };
    window.addEventListener('keydown',inspect,true);
    return () => window.removeEventListener('keydown',inspect,true);
  },[target.id,disabled,onInteract]);
  return <aside className="discovery-dock" aria-label="附近的发现" key={target.id}>
    <div className="discovery-name"><strong>{label}</strong>{hint && <span>{hint}</span>}</div>
    <button disabled={disabled} onClick={() => onInteract(target.id)} aria-label={`查看${label}`}>{!touch && <><kbd>Q</kbd><span aria-hidden="true">·</span></>}<span>{touch ? '轻点查看' : '查看详情'}</span></button>
  </aside>;
}
