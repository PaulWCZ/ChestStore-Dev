"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Close } from "./icons.tsx";

// A modal dialog on the platform's <dialog>: focus trapped and restored by
// the browser, Escape closes, the backdrop click closes. It opens on its
// first field (the browser would pick the close button, and whoever types
// at once would type into nothing).
export function Dialog({ open, title, closeLabel, onClose, children }: { open: boolean; title: string; closeLabel: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      d.querySelector<HTMLElement>(".dialog-body :is(input:not([type=hidden]):not([type=radio]):not([type=checkbox]), textarea, select), .dialog-body [data-autofocus]")?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="dialog-title" onClose={onClose} onClick={e => { if (e.target === ref.current) onClose(); }}>
      <div className="dialog-head">
        <h2 id="dialog-title">{title}</h2>
        <button type="button" className="icon-button" onClick={onClose}><Close /><span className="visually-hidden">{closeLabel}</span></button>
      </div>
      {open && <div className="dialog-body">{children}</div>}
    </dialog>
  );
}
