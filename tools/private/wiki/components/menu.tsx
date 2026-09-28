"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

// A small menu behind a button ("More"): opens below it, closes on Escape,
// on a click outside, or once an item is chosen. Items are ordinary links
// and buttons, reached with Tab; the menu's button says whether it is open.
export function Menu({ label, icon, children, align = "end" }: { label: string; icon: ReactNode; children: ReactNode; align?: "start" | "end" }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); box.current?.querySelector<HTMLButtonElement>("button")?.focus(); } };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", key);
    box.current?.querySelector<HTMLElement>(".menu-list a, .menu-list button")?.focus();
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div className="menu" ref={box}>
      <button type="button" className="button quiet" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>
        {icon}<span className="label">{label}</span>
      </button>
      <div id={id} className={`menu-list ${align}`} hidden={!open} onClick={e => { if ((e.target as HTMLElement).closest("a, button")) setOpen(false); }}>
        {children}
      </div>
    </div>
  );
}
