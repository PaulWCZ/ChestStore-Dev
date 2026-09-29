"use client";

import { fold, listKey } from "@argentic/chest-ui/components/logic";
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { Close, Plus } from "../../../components/icons.tsx";
import type { Choice } from "./shared.ts";

export type Option = Choice & { detail?: string };
type Props<T extends Option> = {
  id: string;
  value: Choice | null;
  onChange: (choice: T | null) => void;
  // The server's search: the first matches for what is typed ("" on focus).
  // The same rule as the kit's people picker (lib/search.ts: accents and
  // case aside, the start of any word), done by the database.
  search: (q: string) => Promise<T[]>;
  placeholder: string;
  clearLabel: string;
  noMatch: string;
  // "+ New company “xyz”": offered last when something is typed.
  create?: { label: (q: string) => string; run: (q: string) => Promise<T | null> };
};

// A picker of records — a company, a contact — that searches as one types,
// instead of a list of the whole client book: it works with 20 companies or
// 20,000. The UI kit's PeoplePicker chooses people and groups (avatars,
// Chest groups); this one chooses the tool's records and may create one on
// the spot, so it stays the tool's own — but it behaves exactly like the
// kit's combobox and wears its classes: the same keys (the kit's listKey:
// Down opens or moves, wrapping; Up from a closed list opens on the last;
// Enter chooses; Escape closes, a second Escape puts the chosen name back;
// Tab closes and moves on), the same list (ck-listbox, ck-option), placed
// over a dialog's edge rather than cut by it.
export function Combobox<T extends Option>({ id, value, onChange, search, placeholder, clearLabel, noMatch, create }: Props<T>) {
  const [text, setText] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<T[]>([]);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const list = useId();
  const asked = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = text.trim() !== "" && text !== value?.name;
  // "Pharmacie centrale" is the same name as "Pharmacie Centrale": no
  // second one offered (accents and case aside, as the search reads them).
  const offerCreate = Boolean(create && typed && !options.some(o => fold(o.name) === fold(text.trim())));
  const count = options.length + (offerCreate ? 1 : 0);
  useFloat(box, listRef, open);

  useEffect(() => { setText(value?.name ?? ""); }, [value?.id, value?.name]);
  useEffect(() => {
    if (!open) return;
    const n = ++asked.current;
    const timer = setTimeout(async () => {
      const found = await search(typed ? text.trim() : "").catch(() => []);
      if (n !== asked.current) return;
      setOptions(found);
      setActive(found.length > 0 || (create && typed) ? 0 : -1);
    }, typed ? 180 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, open]);

  async function choose(index: number) {
    if (index < options.length) {
      const o = options[index]!;
      onChange(o);
      setText(o.name);
      setOpen(false);
      return;
    }
    if (offerCreate && create) {
      setBusy(true);
      const made = await create.run(text.trim());
      setBusy(false);
      if (made) {
        onChange(made);
        setText(made.name);
      }
      setOpen(false);
    }
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    // A second Escape (the list already closed) puts the chosen name back.
    if (e.key === "Escape" && !open && text !== (value?.name ?? "")) {
      e.preventDefault();
      e.stopPropagation();
      setText(value?.name ?? "");
      return;
    }
    const move = listKey({ active, open }, count, e.key, e.altKey);
    if (!move) {
      // The list is shown but nothing is chosen: Enter never sends the
      // form around the picker with a half-typed name.
      if (e.key === "Enter" && open) e.preventDefault();
      return;
    }
    if (e.key !== "Tab") e.preventDefault();
    // Escape closes the list here, not the dialog around it.
    if (e.key === "Escape") e.stopPropagation();
    setOpen(move.open);
    setActive(move.active);
    if (move.choose) void choose(move.active);
  }
  const optionId = (i: number) => `${list}-o${i}`;
  return (
    <div className="combo ck-picker" ref={box}>
      <input id={id} className="field" role="combobox" aria-expanded={open} aria-controls={list} aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        value={text} placeholder={placeholder} autoComplete="off" spellCheck={false} maxLength={100} disabled={busy}
        onChange={e => { setText(e.target.value); setOpen(true); if (e.target.value === "" && value) onChange(null); }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => { setOpen(false); setText(t => (t.trim() === "" ? "" : value?.name ?? "")); }}
        onKeyDown={onKey} />
      {value && (
        <button type="button" className="combo-clear icon-button small" onClick={() => { onChange(null); setText(""); }}>
          <Close /><span className="visually-hidden">{clearLabel}</span>
        </button>
      )}
      <ul id={list} ref={listRef} role="listbox" className="ck-listbox combo-list" hidden={!open}>
        {options.map((o, i) => (
          <li key={o.id} id={optionId(i)} role="option" aria-selected={i === active} className={`ck-option${i === active ? " ck-active" : ""}`}
            onMouseDown={e => { e.preventDefault(); void choose(i); }} onMouseMove={() => { if (i !== active) setActive(i); }}>
            <span className="ck-option-text">
              <span className="ck-option-name">{o.name}</span>
              {o.detail && <span className="ck-option-detail">{o.detail}</span>}
            </span>
          </li>
        ))}
        {offerCreate && create && (
          <li id={optionId(options.length)} role="option" aria-selected={active === options.length} className={`ck-option combo-create${active === options.length ? " ck-active" : ""}`}
            onMouseDown={e => { e.preventDefault(); void choose(options.length); }} onMouseMove={() => { if (active !== options.length) setActive(options.length); }}>
            <Plus /><span className="ck-option-name">{create.label(text.trim())}</span>
          </li>
        )}
        {count === 0 && <li className="ck-list-empty" role="presentation">{noMatch}</li>}
      </ul>
    </div>
  );
}

// The list must not be cut at the edge of a dialog (which scrolls): there
// it is placed `fixed` under its field, and follows it. The kit does the
// same for its own pickers (its float.ts, MIT, this studio), but does not
// export it; this is its rule, shortened.
function useFloat(anchor: RefObject<HTMLElement | null>, float: RefObject<HTMLElement | null>, open: boolean) {
  useLayoutEffect(() => {
    const a = anchor.current, f = float.current;
    if (!open || !a || !f || !a.closest("dialog")) return;
    const place = () => {
      const r = a.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - 4, above = r.top - 4;
      const top = below >= f.offsetHeight || below >= above ? r.bottom + 4 : Math.max(4, r.top - 4 - f.offsetHeight);
      f.style.position = "fixed";
      f.style.top = `${Math.round(top)}px`;
      f.style.left = `${Math.round(r.left)}px`;
      f.style.right = "auto";
      f.style.margin = "0";
      f.style.width = `${Math.round(r.width)}px`;
      f.style.maxHeight = `min(320px, 50vh, ${Math.max(120, Math.round(Math.max(below, above)))}px)`;
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      for (const p of ["position", "top", "left", "right", "margin", "width", "maxHeight"] as const) f.style[p] = "";
    };
  });
}
