"use client";

// Menu: a button that opens a short list of actions (the ARIA menu button
// pattern): arrows move, Home/End, a letter jumps, Enter or Space runs,
// Escape closes and gives focus back to the button. For rare actions (a
// row's "Duplicate", "Delete"): frequent ones are buttons on the page.
import { useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useFloat } from "./float.js";
import { MoreIcon } from "./icons.js";
import { menuKey } from "./keys.js";

export type MenuItem = {
  // A stable key when two items may share a label (two people named alike)
  // (0.2.2; the label otherwise, with its place).
  readonly id?: string;
  readonly label: string;
  // A second line under the label, quieter ("Due Tuesday", "3 open") (0.2.2).
  readonly note?: string;
  readonly onSelect?: () => void;
  // A link instead of an action.
  readonly href?: string;
  // A link that downloads (true, or the file's name) — a plain <a>, never
  // the tool's link component (0.2.2).
  readonly download?: boolean | string;
  readonly tone?: "danger";
  readonly disabled?: boolean;
  readonly icon?: ReactNode;
};

// What a Menu gives its link component (Next.js's Link fits as it is).
export type MenuLinkProps = { href: string; className?: string; role: "menuitem"; tabIndex: number; onClick: () => void; children: ReactNode };
export type MenuLinkComponent = (props: MenuLinkProps) => ReactNode;

export type MenuProps = {
  readonly label: string;
  readonly items: readonly MenuItem[];
  readonly icon?: ReactNode;
  // The label shown on the button (a quiet button), not only read.
  readonly showLabel?: boolean;
  // A shown label's button: "s" (default, smaller words) or "m" — both
  // keep the 44 px target (0.2.2).
  readonly size?: "s" | "m";
  readonly align?: "start" | "end";
  // Next.js's <Link> for href items (client navigation) (0.2.2).
  readonly link?: MenuLinkComponent;
  readonly className?: string;
};

export function Menu({ label, items, icon, showLabel = false, size = "s", align = "end", link, className }: MenuProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const id = useId();
  // In a table's scrolling frame or a dialog, the menu is placed over it.
  useFloat(button, list, open, { align, scroll: false });

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
    <div className={`ck-menu${className ? " " + className : ""}`} ref={wrap}>
      <button
        ref={button}
        type="button"
        id={id + "-button"}
        className={showLabel ? `ck-button ck-button-quiet${size === "s" ? " ck-button-small" : ""}` : "ck-icon-button"}
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
          {items.map((item, i) => {
            const cls = `ck-menu-item${item.tone === "danger" ? " ck-danger" : ""}${item.note ? " ck-menu-item-2" : ""}`;
            const content = item.note
              ? <>{item.icon}<span className="ck-menu-item-text"><span>{item.label}</span><span className="ck-menu-item-note">{item.note}</span></span></>
              : <>{item.icon}{item.label}</>;
            const tabIndex = i === active ? 0 : -1;
            const L = link;
            return (
              <li key={item.id ?? `${i}-${item.label}`} role="none">
                {item.href && !item.disabled ? (
                  item.download !== undefined && item.download !== false ? (
                    <a role="menuitem" href={item.href} download={item.download === true ? "" : item.download} tabIndex={tabIndex} className={cls} onClick={() => setOpen(false)}>{content}</a>
                  ) : L ? (
                    <L href={item.href} role="menuitem" tabIndex={tabIndex} className={cls} onClick={() => setOpen(false)}>{content}</L>
                  ) : (
                    <a role="menuitem" href={item.href} tabIndex={tabIndex} className={cls} onClick={() => setOpen(false)}>{content}</a>
                  )
                ) : (
                  <button type="button" role="menuitem" tabIndex={tabIndex} aria-disabled={item.disabled || undefined} className={cls} onClick={() => run(item)}>{content}</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
