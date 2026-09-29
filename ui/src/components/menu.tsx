"use client";

// Menu: a button that opens a short list of actions (the ARIA menu button
// pattern): arrows move, Home/End, a letter jumps, Enter or Space runs,
// Escape closes and gives focus back to the button. For rare actions (a
// row's "Duplicate", "Delete"): frequent ones are buttons on the page.
import { useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { MoreIcon } from "./icons.js";
import { menuKey } from "./keys.js";

export type MenuItem = {
  readonly label: string;
  readonly onSelect?: () => void;
  // A link instead of an action.
  readonly href?: string;
  readonly tone?: "danger";
  readonly disabled?: boolean;
  readonly icon?: ReactNode;
};

export function Menu({ label, items, icon, showLabel = false, align = "end" }: { label: string; items: readonly MenuItem[]; icon?: ReactNode; showLabel?: boolean; align?: "start" | "end" }): ReactElement {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    list.current?.querySelectorAll<HTMLElement>("[role=menuitem]")[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  const run = (item: MenuItem) => {
    if (item.disabled) return;
    close();
    item.onSelect?.();
  };

  return (
    <div className="ck-menu" ref={wrap}>
      <button
        ref={button}
        type="button"
        id={id + "-button"}
        className={showLabel ? "ck-button ck-button-quiet ck-button-small" : "ck-icon-button"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id + "-menu" : undefined}
        onClick={() => { setActive(0); setOpen(o => !o); }}
        onKeyDown={e => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setActive(e.key === "ArrowDown" ? 0 : items.length - 1);
            setOpen(true);
          }
        }}
      >
        {icon ?? <MoreIcon />}
        {showLabel ? <span>{label}</span> : <span className="ck-vh">{label}</span>}
      </button>
      {open && (
        <ul
          ref={list}
          id={id + "-menu"}
          role="menu"
          aria-labelledby={id + "-button"}
          className={`ck-menu-list ck-menu-${align}`}
          onKeyDown={e => {
            const move = menuKey(active, items.map(i => i.label), e.key);
            if (!move) return;
            e.preventDefault();
            if (move.close) close(e.key !== "Tab");
            else setActive(move.active);
          }}
        >
          {items.map((item, i) => (
            <li key={item.label} role="none">
              {item.href && !item.disabled ? (
                <a role="menuitem" href={item.href} tabIndex={i === active ? 0 : -1} className={`ck-menu-item${item.tone === "danger" ? " ck-danger" : ""}`} onClick={() => setOpen(false)}>{item.icon}{item.label}</a>
              ) : (
                <button type="button" role="menuitem" tabIndex={i === active ? 0 : -1} aria-disabled={item.disabled || undefined} className={`ck-menu-item${item.tone === "danger" ? " ck-danger" : ""}`} onClick={() => run(item)}>{item.icon}{item.label}</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
