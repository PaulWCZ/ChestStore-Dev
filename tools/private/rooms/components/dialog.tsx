"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Close } from "./icons.tsx";

// A modal dialog on the platform's <dialog>: focus trapped and restored by
// the browser, Escape and the close button close it. A tap outside closes
// it too — unless it holds a form someone started (dismissible false): a
// stray tap on a phone never throws away what was typed.
export function Dialog({ open, title, closeLabel, onClose, dismissible = true, children }: { open: boolean; title: string; closeLabel: string; onClose: () => void; dismissible?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="dialog-title" onClose={onClose} onClick={e => { if (dismissible && e.target === ref.current) onClose(); }}>
      <div className="dialog-head">
        <h2 id="dialog-title">{title}</h2>
        <button type="button" className="icon-button" onClick={onClose}><Close /><span className="visually-hidden">{closeLabel}</span></button>
      </div>
      {open && <div className="dialog-body">{children}</div>}
    </dialog>
  );
}
