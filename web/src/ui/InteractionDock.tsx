function DiscoveryIcon({id}: {id:string}) {
  const path = /puddle|reflection/.test(id) ? <><path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11Z"/><path d="M9 15c0 2 1 3 3 3"/></>
    : /can|fish/.test(id) ? <><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 4 14 4 14 0V6M5 12c3 2 11 2 14 0"/></>
    : /poster|notice|letter/.test(id) ? <><path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5"/></>
    : /crate|box/.test(id) ? <><path d="m3 7 9-4 9 4v11l-9 4-9-4ZM3 7l9 4 9-4M12 11v11M8 5l9 4"/></>
    : <><path d="M8 14c-1 1-3 3-2 5s4 0 6 0 5 2 6 0-1-4-2-5c-2-3-6-3-8 0Z"/><ellipse cx="5" cy="10" rx="2" ry="3"/><ellipse cx="10" cy="6" rx="2" ry="3"/><ellipse cx="15" cy="6" rx="2" ry="3"/><ellipse cx="20" cy="10" rx="2" ry="3"/></>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>;
}
export default function InteractionDock({target,touch,disabled,hint,onInteract}: {target:{id:string;label:string};touch:boolean;disabled:boolean;hint?:string|null;onInteract:(id:string) => void}) {
  const label = target.label.replace(/\s*·\s*[ECQF]$/,'').replace(/^[\p{Extended_Pictographic}\s]+/u,'');
  return <aside className="discovery-dock" aria-label="附近的发现" key={target.id}>
    <span className="discovery-icon"><DiscoveryIcon id={target.id}/></span>
    <div className="discovery-name"><small>附近的发现</small><strong>{label}</strong>{hint && <span>{hint}</span>}</div>
    <button disabled={disabled} onClick={() => onInteract(target.id)}>{!touch && <kbd>E</kbd>}<span>查看</span><i aria-hidden="true">↗</i></button>
  </aside>;
}
