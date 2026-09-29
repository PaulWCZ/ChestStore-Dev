"use client";

import { useId, useState, type ReactNode } from "react";
import { Sliders } from "./icons.tsx";

// On a phone the inbox's filters (priority, tag, order, saving a view)
// wait behind one "Filter (n)" button, so the first ticket is near the top
// of the screen; on a wider screen they are all shown, as before.
export function FilterToggle({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <>
      <button type="button" className="ck-button ck-button-quiet ck-button-small filter-toggle" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(!open)}>
        <Sliders />{label}
        {count > 0 && <span className="n">{count}</span>}
      </button>
      <div id={panel} className={open ? "filter-more open" : "filter-more"}>{children}</div>
    </>
  );
}
