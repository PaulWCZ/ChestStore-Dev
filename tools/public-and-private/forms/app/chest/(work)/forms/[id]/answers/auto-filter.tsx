"use client";

import { useRef, type ReactNode } from "react";

// The answers' filters apply as soon as one changes (a choice, a column;
// the days send it themselves: answers-table.tsx FilterDates). A plain GET
// form: the filter lives in the address, which can be shared or reloaded.
export function AutoFilter({ action, className, label, children }: { action: string; className: string; label: string; children: ReactNode }) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} className={className} method="get" action={action} role="search" aria-label={label}
      onChange={e => { const el = e.target as HTMLElement; if (el.tagName === "SELECT" || (el as HTMLInputElement).type === "checkbox") ref.current?.requestSubmit(); }}>
      {children}
    </form>
  );
}
