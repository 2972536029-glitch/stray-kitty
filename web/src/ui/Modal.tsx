import {useEffect, useRef, type ReactNode} from 'react';

export default function Modal({title, onClose, children, className = ''}: {title: string; onClose: () => void; children: ReactNode; className?: string}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    return () => {dialog.close();previous?.focus();};
  }, []);
  return <dialog ref={ref} className={`game-modal ${className}`} aria-label={title} onCancel={e => {e.preventDefault();onClose();}} onClick={e => {if (e.target === e.currentTarget) {const b = e.currentTarget.getBoundingClientRect();if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) onClose();}}}>
    <button className="modal-close" aria-label={`关闭${title}`} onClick={onClose}>×</button>{children}
  </dialog>;
}
