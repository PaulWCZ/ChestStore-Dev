"use client";

import { useId, useState, type ReactNode } from "react";
import { Down } from "../../../../../../components/icons.tsx";

// The answers' filters behind one "Filter" button on a phone (the list
// comes first); always shown on a wider screen (CSS). Open from the start
// when a filter is on, so what filters the list is never hidden.
export function FilterFold({ active, label, children }: { active: number; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(active > 0);
  const id = useId();
  return (
    <div className={`filter-fold${open ? " open" : ""}`}>
      <button type="button" className="button quiet small filter-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>
        {label}{active > 0 && <span className="filter-count">{active}</span>}<span className="chevron" aria-hidden="true"><Down /></span>
      </button>
      <div id={id} className="filter-body">{children}</div>
    </div>
  );
}
