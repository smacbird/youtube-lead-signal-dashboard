import React, { useEffect, useId, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal dialog: role=dialog + aria-modal, labelled by its title, focus moved in on
 * open and restored on close, Tab trapped inside, Escape / Close button / backdrop click close,
 * page scroll locked while open.
 */
export function Modal({ open, title, onClose, children, wide = false }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    returnFocus.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]') || dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first || dialogRef.current)?.focus();
    }, 0);

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const nodes = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((node) => node.offsetParent !== null);
      if (!nodes.length) { event.preventDefault(); return; }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = previousOverflow;
      returnFocus.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className={wide ? 'modal-dialog wide' : 'modal-dialog'} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="quiet-button" onClick={onClose}>Close</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
