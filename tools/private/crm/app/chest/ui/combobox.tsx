"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Close, Plus } from "../../../components/icons.tsx";
import type { Choice } from "./shared.ts";

export type Option = Choice & { detail?: string };
type Props<T extends Option> = {
  id: string;
  value: Choice | null;
  onChange: (choice: T | null) => void;
  // The server's search: the first matches for what is typed ("" on focus).
  search: (q: string) => Promise<T[]>;
  placeholder: string;
  clearLabel: string;
  noMatch: string;
  // "+ New company “xyz”": offered last when something is typed.
  create?: { label: (q: string) => string; run: (q: string) => Promise<T | null> };
};

// A picker that searches as one types — the same search as "/" — instead
// of a list of the whole client book: it works with 20 companies or 20,000.
// The ARIA 1.2 combobox pattern: arrows move through the options, Enter
// chooses, Escape closes; the chosen one reads in the field, a cross clears
// it.
export function Combobox<T extends Option>({ id, value, onChange, search, placeholder, clearLabel, noMatch, create }: Props<T>) {
  const [text, setText] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<T[]>([]);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const list = useId();
  const asked = useRef(0);
  const typed = text.trim() !== "" && text !== value?.name;
  const offerCreate = create && typed && !options.some(o => o.name.toLocaleLowerCase() === text.trim().toLocaleLowerCase());
  const count = options.length + (offerCreate ? 1 : 0);

  useEffect(() => { setText(value?.name ?? ""); }, [value?.id, value?.name]);
  useEffect(() => {
    if (!open) return;
    const n = ++asked.current;
    const timer = setTimeout(async () => {
      const found = await search(typed ? text.trim() : "").catch(() => []);
      if (n !== asked.current) return;
      setOptions(found);
      setActive(found.length > 0 ? 0 : offerCreate ? 0 : -1);
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
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive(a => (count === 0 ? -1 : (a + 1) % count));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(a => (count === 0 ? -1 : (a - 1 + count) % count));
    } else if (e.key === "Enter" && open && active >= 0) {
      e.preventDefault();
      void choose(active);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
      setText(value?.name ?? "");
    }
  }
  const optionId = (i: number) => `${list}-o${i}`;
  return (
    <div className="combo">
      <input id={id} className="field" role="combobox" aria-expanded={open} aria-controls={list} aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        value={text} placeholder={placeholder} autoComplete="off" maxLength={100} disabled={busy}
        onChange={e => { setText(e.target.value); setOpen(true); if (e.target.value === "" && value) onChange(null); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => { setOpen(false); setText(t => (t.trim() === "" ? "" : value?.name ?? "")); }, 150)}
        onKeyDown={onKey} />
      {value && (
        <button type="button" className="combo-clear icon-button small" onClick={() => { onChange(null); setText(""); }}>
          <Close /><span className="visually-hidden">{clearLabel}</span>
        </button>
      )}
      <ul id={list} role="listbox" className="combo-list" hidden={!open}>
        {options.map((o, i) => (
          <li key={o.id} id={optionId(i)} role="option" aria-selected={i === active} className={i === active ? "active" : undefined}
            onMouseDown={e => { e.preventDefault(); void choose(i); }} onMouseEnter={() => setActive(i)}>
            <span className="combo-name">{o.name}</span>
            {o.detail && <span className="combo-detail">{o.detail}</span>}
          </li>
        ))}
        {offerCreate && create && (
          <li id={optionId(options.length)} role="option" aria-selected={active === options.length} className={`combo-create${active === options.length ? " active" : ""}`}
            onMouseDown={e => { e.preventDefault(); void choose(options.length); }} onMouseEnter={() => setActive(options.length)}>
            <Plus />{create.label(text.trim())}
          </li>
        )}
        {count === 0 && <li className="combo-empty" role="presentation">{noMatch}</li>}
      </ul>
    </div>
  );
}
