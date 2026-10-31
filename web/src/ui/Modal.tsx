import {createContext, useContext, useEffect, useRef, type ReactNode} from 'react';

// Embed one existing window in the home hub. Its own child dialogs still open
// normally, so furniture detail and payment flows keep their modal behavior.
export const EmbeddedModalContext=createContext(false);

export default function Modal({title, onClose, children, className = ''}: {title: string; onClose: () => void; children: ReactNode; className?: string}) {
  const ref = useRef<HTMLDialogElement>(null);
  const embedded=useContext(EmbeddedModalContext);
  useEffect(() => {
    if(embedded)return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    return () => {dialog.close();previous?.focus();};
  }, [embedded]);
  const content=<EmbeddedModalContext.Provider value={false}>{children}</EmbeddedModalContext.Provider>;
  if(embedded)return <section className={`embedded-modal ${className}`} role="region" aria-label={title}>{content}</section>;
  return <dialog ref={ref} className={`game-modal ${className}`} aria-label={title} onCancel={e => {e.preventDefault();e.stopPropagation();onClose();}} onClick={e => {if (e.target === e.currentTarget) {const b = e.currentTarget.getBoundingClientRect();if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) onClose();}}}>
    <button className="modal-close" aria-label={`关闭${title}`} onClick={onClose}>×</button>{content}
  </dialog>;
}
