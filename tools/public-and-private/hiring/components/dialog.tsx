"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Close } from "./icons.tsx";

// A modal dialog on the platform's <dialog>: focus trapped and restored by
// the browser, Escape closes, the backdrop click closes.
export function Dialog({ open, title, closeLabel, onClose, children }: { open: boolean; title: string; closeLabel: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  // Each dialog its own title id: a page holds several.
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId} onClose={onClose} onClick={e => { if (e.target === ref.current) onClose(); }}>
      <div className="dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" onClick={onClose}><Close /><span className="visually-hidden">{closeLabel}</span></button>
      </div>
      {open && <div className="dialog-body">{children}</div>}
    </dialog>
  );
}
