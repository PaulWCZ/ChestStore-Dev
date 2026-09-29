"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Close } from "./icons.tsx";

// A modal dialog on the platform's <dialog>: focus trapped and restored by
// the browser, Escape or the close button closes. A tap beside it does
// not: a stray tap never throws away what was being done. `alert`: an act
// that cannot be undone (role alertdialog).
export function Dialog({ open, title, closeLabel, onClose, children, alert = false }: { open: boolean; title: string; closeLabel: string; onClose: () => void; children: ReactNode; alert?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId} role={alert ? "alertdialog" : undefined} onClose={onClose}>
      <div className="dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" onClick={onClose}><Close /><span className="visually-hidden">{closeLabel}</span></button>
      </div>
      {open && <div className="dialog-body">{children}</div>}
    </dialog>
  );
}
