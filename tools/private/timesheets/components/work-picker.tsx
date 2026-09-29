"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { format } from "../lib/i18n/format.ts";
import { readWork } from "../lib/work.ts";

// What time is spent on: the projects open to the person, each alone and
// with each of its tasks ("Website · Design"), and their client. A field
// one types into to find it among forty projects (a combobox: arrows,
// Enter, Escape), rather than a long list. Its value is "projectId" or
// "projectId:taskId".
export type PickerProject = { id: string; name: string; clientName: string | null; color: string; billable: boolean; tasks: { id: string; name: string }[] };

type Words = { label: string; choose: string; noClient: string; task: string; noMatch: string };
type Option = { value: string; label: string; client: string; color: string; key: string };

// Accents, case and spaces aside, as people type.
const fold = (text: string) => text.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/\s+/gu, " ").trim();

export function WorkPicker({ projects, value, onChange, id, t, className = "field", disabled, hideLabel = true }: { projects: PickerProject[]; value: string; onChange: (value: string) => void; id: string; t: Words; className?: string; disabled?: boolean; hideLabel?: boolean }) {
  const options = useMemo<Option[]>(() => projects.flatMap(p => {
    const client = p.clientName ?? t.noClient;
    return [
      { value: p.id, label: p.name, client, color: p.color, key: fold(`${p.name} ${client}`) },
      ...p.tasks.map(k => ({ value: `${p.id}:${k.id}`, label: format(t.task, { project: p.name, task: k.name }), client, color: p.color, key: fold(`${p.name} ${k.name} ${client}`) })),
    ];
  }), [projects, t]);
  const known = projects.some(p => p.id === readWork(value)?.projectId);
  const chosen = known ? options.find(o => o.value === value) : undefined;
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useId();
  const words = fold(text ?? "").split(" ").filter(Boolean);
  const shown = text === null || words.length === 0 ? options : options.filter(o => words.every(w => o.key.includes(w)));

  function pick(o: Option) {
    onChange(o.value);
    setText(null);
    setOpen(false);
  }
  function key(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive(i => Math.min(shown.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(i => Math.max(0, i - 1));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      const o = shown[active];
      if (o) pick(o);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setText(null);
    }
  }
  const activeOption = open ? shown[active] : undefined;
  useEffect(() => {
    if (activeOption) document.getElementById(`${list}-${activeOption.value}`)?.scrollIntoView({ block: "nearest" });
  }, [activeOption, list]);
  return (
    <span className="picker">
      <label htmlFor={id} className={hideLabel ? "visually-hidden" : "label"}>{t.label}</label>
      <input
        ref={input}
        id={id}
        className={`${className} picker-input`}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={list}
        aria-activedescendant={activeOption ? `${list}-${activeOption.value}` : undefined}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        placeholder={t.choose}
        value={text ?? chosen?.label ?? ""}
        onFocus={e => { e.currentTarget.select(); setOpen(true); setActive(Math.max(0, options.findIndex(o => o.value === value))); }}
        onClick={() => setOpen(true)}
        onChange={e => { setText(e.target.value); setOpen(true); setActive(0); }}
        onBlur={() => { setOpen(false); setText(null); }}
        onKeyDown={key}
      />
      {open && (
        <ul id={list} role="listbox" className="picker-list" aria-label={t.label}>
          {shown.length === 0 && <li className="picker-none" role="presentation">{t.noMatch}</li>}
          {shown.map((o, i) => (
            <li
              key={o.value}
              id={`${list}-${o.value}`}
              role="option"
              aria-selected={o.value === value}
              className={`picker-option${i === active ? " active" : ""}`}
              onMouseDown={e => { e.preventDefault(); pick(o); }}
              onMouseEnter={() => setActive(i)}
            >
              <span className={`swatch c-${o.color}`} aria-hidden="true" />
              <span className="picker-label">{o.label}</span>
              <span className="picker-client">{o.client}</span>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
