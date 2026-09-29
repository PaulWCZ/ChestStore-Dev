"use client";

import { useFloat } from "@argentic/chest-ui/components";
import { listKey, matches } from "@argentic/chest-ui/components/logic";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { format } from "../lib/i18n/format.ts";
import { readWork } from "../lib/work.ts";

// What time is spent on: the projects open to the person, each alone and
// with each of its tasks ("Website · Design"), and their client. A field
// one types into to find it among forty projects, rather than a long list.
// Its value is "projectId" or "projectId:taskId".
//
// The UI kit has no picker of records (its PeoplePicker chooses people and
// groups, with avatars): this one keeps the tool's own list (a colour
// swatch, the client) but behaves exactly like the kit's combobox — the
// same keys (the kit's listKey: Down opens or moves, wrapping; Up from a
// closed list opens on the last; Enter chooses; Escape closes, a second
// Escape puts the chosen project's name back; Tab closes and moves on) and
// the same search (the kit's matches: accents and case aside, each word
// typed starts a word of the project, task or client, in any order).
export type PickerProject = { id: string; name: string; clientName: string | null; color: string; billable: boolean; tasks: { id: string; name: string }[] };

type Words = { label: string; choose: string; noClient: string; task: string; noMatch: string };
type Option = { value: string; label: string; client: string; color: string; key: string };

export function WorkPicker({ projects, value, onChange, id, t, className = "field", disabled, hideLabel = true }: { projects: PickerProject[]; value: string; onChange: (value: string) => void; id: string; t: Words; className?: string; disabled?: boolean; hideLabel?: boolean }) {
  const options = useMemo<Option[]>(() => projects.flatMap(p => {
    const client = p.clientName ?? t.noClient;
    return [
      { value: p.id, label: p.name, client, color: p.color, key: `${p.name} ${client}` },
      ...p.tasks.map(k => ({ value: `${p.id}:${k.id}`, label: format(t.task, { project: p.name, task: k.name }), client, color: p.color, key: `${p.name} ${k.name} ${client}` })),
    ];
  }), [projects, t]);
  const known = projects.some(p => p.id === readWork(value)?.projectId);
  const chosen = known ? options.find(o => o.value === value) : undefined;
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useId();
  const typed = (text ?? "").trim();
  const shown = typed === "" ? options : options.filter(o => matches(o.key, typed));

  function pick(o: Option) {
    onChange(o.value);
    setText(null);
    setOpen(false);
  }
  function key(e: KeyboardEvent<HTMLInputElement>) {
    // A second Escape (the list already closed) puts the chosen name back.
    if (e.key === "Escape" && !open && text !== null) {
      e.preventDefault();
      setText(null);
      return;
    }
    const move = listKey({ active, open }, shown.length, e.key, e.altKey);
    if (!move) return;
    if (e.key !== "Tab") e.preventDefault();
    // Escape closes the list here, not the dialog or the popover around it.
    if (e.key === "Escape") e.stopPropagation();
    setOpen(move.open);
    setActive(move.active);
    if (move.choose && shown[move.active]) pick(shown[move.active]!);
  }
  const activeOption = open && active >= 0 ? shown[active] : undefined;
  // Inside a box that scrolls (the week's grid) the list is placed over it,
  // as the kit's own lists are, never cut at its edge.
  const listRef = useRef<HTMLUListElement>(null);
  useFloat(input, listRef, open);
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
        <ul ref={listRef} id={list} role="listbox" className="picker-list" aria-label={t.label}>
          {shown.length === 0 && <li className="picker-none" role="presentation">{t.noMatch}</li>}
          {shown.map((o, i) => (
            <li
              key={o.value}
              id={`${list}-${o.value}`}
              role="option"
              aria-selected={i === active}
              data-chosen={o.value === value || undefined}
              className={`picker-option${i === active ? " active" : ""}`}
              onMouseDown={e => { e.preventDefault(); pick(o); }}
              onMouseMove={() => { if (i !== active) setActive(i); }}
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
