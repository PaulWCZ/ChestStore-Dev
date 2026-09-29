"use client";

// PeoplePicker: choose one person, or several (chips), or a Chest group, by
// typing a name — the ARIA 1.2 combobox: the list follows the field
// (aria-activedescendant), arrows move, Enter chooses, Escape closes,
// Backspace in an empty field takes the last chip away. With nothing typed
// it offers the person's recent choices first.
//
// The data comes from the tool: `search(query)` answers the matches (the
// tool's server, or `localSearch(list)` over a list the page holds). Ids
// are what the tool stores (mbr_… for people, the group's id for groups);
// with `name`, hidden inputs carry them in a form.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { Avatar } from "./avatar.js";
import { useFloat } from "./float.js";
import { CloseIcon, GroupIcon } from "./icons.js";
import { listKey } from "./keys.js";
import type { Choice } from "./people.js";
import { fill, plural } from "./text.js";
import { en, type PeoplePickerWords } from "./words.js";

export type PeoplePickerProps<T extends Choice> = {
  // The field's label (a picker always has one).
  readonly label: string;
  // Keep the label for screen readers only (a picker in a table cell whose
  // column header says it) (0.2.1).
  readonly hideLabel?: boolean;
  readonly search: (query: string) => Promise<readonly T[]>;
  readonly value: readonly T[];
  readonly onChange: (value: T[]) => void;
  readonly multiple?: boolean;
  // Offered when nothing is typed (the person's recent choices, "You").
  readonly suggestions?: readonly T[];
  // The heading over them: the words' `recent` by default; "Suggested",
  // "Your team"… when they are not the person's recent choices (0.2.1).
  readonly suggestionsLabel?: string;
  // Form field name: one hidden input per chosen id.
  readonly name?: string;
  readonly id?: string;
  readonly hint?: string;
  readonly error?: string | null;
  readonly disabled?: boolean;
  readonly required?: boolean;
  readonly labels?: PeoplePickerWords;
  // Language of the plural rules (the words' language).
  readonly lang?: string;
  // Wait this long after the last key before asking (ms).
  readonly delay?: number;
};

export function PeoplePicker<T extends Choice>({ label, hideLabel = false, search, value, onChange, multiple = false, suggestions = [], suggestionsLabel, name, id, hint, error, disabled = false, required = false, labels = en.peoplePicker, lang = "en", delay = 150 }: PeoplePickerProps<T>): ReactElement {
  const auto = useId();
  const fieldId = id ?? auto + "-field";
  const listId = auto + "-list";
  const hintId = auto + "-hint";
  const errorId = auto + "-error";
  const [text, setText] = useState(!multiple && value[0] ? value[0].name : "");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<readonly T[]>([]);
  const [active, setActive] = useState(-1);
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");
  const asked = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const chosenIds = new Set(value.map(v => v.id));
  const single = !multiple ? value[0] ?? null : null;
  const typed = text.trim() !== "" && (multiple || text !== single?.name);
  const listShown = open && !(options.length === 0 && !typed);
  // Inside a dialog the list is placed over it, never cut at its edge.
  useFloat(box, list, listShown, { matchWidth: true });

  // A single choice shows its name in the field.
  useEffect(() => { if (!multiple) setText(value[0]?.name ?? ""); }, [multiple, value[0]?.id, value[0]?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const n = ++asked.current;
    const q = typed ? text.trim() : "";
    if (!q) {
      setOptions(suggestions.filter(s => !multiple || !chosenIds.has(s.id)));
      setActive(-1);
      setState("idle");
      return;
    }
    // While the answer is on its way the earlier list stays in view, but
    // nothing in it is active: Enter must not choose from an old answer.
    setState("busy");
    setActive(-1);
    const timer = setTimeout(() => {
      search(q).then(found => {
        if (n !== asked.current) return;
        // Groups first, then people: the order the list shows them in.
        const kept = found.filter(f => !multiple || !chosenIds.has(f.id));
        setOptions([...kept.filter(f => f.kind === "group"), ...kept.filter(f => f.kind !== "group")]);
        setActive(found.length > 0 ? 0 : -1);
        setState("idle");
      }, () => {
        if (n !== asked.current) return;
        setOptions([]);
        setActive(-1);
        setState("failed");
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [text, open]); // eslint-disable-line react-hooks/exhaustive-deps

  function choose(choice: T) {
    if (multiple) {
      onChange(chosenIds.has(choice.id) ? value.filter(v => v.id !== choice.id) : [...value, choice]);
      setText("");
      setOptions(options.filter(o => o.id !== choice.id));
      setActive(-1);
      input.current?.focus();
    } else {
      onChange([choice]);
      setText(choice.name);
      setOpen(false);
    }
  }

  function remove(choice: T) {
    onChange(value.filter(v => v.id !== choice.id));
    input.current?.focus();
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && multiple && text === "" && value.length > 0) {
      remove(value[value.length - 1]!);
      return;
    }
    if (e.key === "Escape" && !open && !multiple && text !== (single?.name ?? "")) {
      setText(single?.name ?? "");
      return;
    }
    // Waiting for an answer: the keys that would choose or move wait too,
    // and Enter never sends the form around the picker.
    if (state === "busy" && (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      return;
    }
    const move = listKey({ active, open }, options.length, e.key, e.altKey);
    if (!move) {
      // The list is shown but nothing is chosen: Enter does nothing (it
      // never sends the form around the picker with a half-typed name).
      if (e.key === "Enter" && listShown) e.preventDefault();
      return;
    }
    if (e.key !== "Tab") e.preventDefault();
    setOpen(move.open);
    setActive(move.active);
    if (move.choose && options[move.active]) choose(options[move.active]!);
    if (move.close && !multiple) setText(single?.name ?? "");
  }

  const optionId = (i: number) => `${auto}-o${i}`;
  const recent = !typed;
  const groups = options.filter(o => o.kind === "group");
  const people = options.filter(o => o.kind !== "group");
  const ordered = options;
  const indexOf = (o: T) => options.indexOf(o);
  const status = state === "busy" ? labels.searching : state === "failed" ? labels.failed : open && typed ? plural(labels.results, options.length, lang) : "";
  const described = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  const renderOption = (o: T) => {
    const i = indexOf(o);
    const chosen = chosenIds.has(o.id);
    return (
      <li key={o.kind + ":" + o.id} id={optionId(i)} role="option" aria-selected={i === active} data-chosen={chosen || undefined}
        className={`ck-option${i === active ? " ck-active" : ""}`}
        onMouseDown={e => { e.preventDefault(); choose(o); }} onMouseMove={() => { if (i !== active) setActive(i); }}>
        {o.kind === "group" ? <span className="ck-avatar ck-avatar-m ck-avatar-group" aria-hidden="true"><GroupIcon /></span> : <Avatar name={o.name} photo={o.photo ?? null} size="m" />}
        <span className="ck-option-text">
          <span className="ck-option-name">{o.name}</span>
          {(o.detail || (o.kind === "group" && o.size !== undefined)) && <span className="ck-option-detail">{o.detail ?? plural(labels.groupSize, o.size ?? 0, lang)}</span>}
        </span>
      </li>
    );
  };

  return (
    <div className={`ck-picker${error ? " ck-invalid" : ""}`}>
      <label className={hideLabel ? "ck-vh" : "ck-label"} htmlFor={fieldId}>{label}</label>
      <div ref={box} className={`ck-picker-box${disabled ? " ck-disabled" : ""}`} onMouseDown={e => { if (e.target === e.currentTarget) { e.preventDefault(); input.current?.focus(); } }}>
        {multiple && value.length > 0 && (
          <ul className="ck-chips" aria-label={labels.chosen}>
            {value.map(v => (
              <li key={v.id} className="ck-chip">
                {v.kind === "group" ? <GroupIcon /> : <Avatar name={v.name} photo={v.photo ?? null} size="s" />}
                <span>{v.name}</span>
                <button type="button" className="ck-chip-remove" disabled={disabled} onClick={() => remove(v)}><CloseIcon /><span className="ck-vh">{fill(labels.remove, { name: v.name })}</span></button>
              </li>
            ))}
          </ul>
        )}
        {!multiple && single && single.kind !== "group" && <Avatar name={single.name} photo={single.photo ?? null} size="s" />}
        <input
          ref={input}
          id={fieldId}
          className="ck-picker-input"
          role="combobox"
          type="text"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
          aria-describedby={described}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          value={text}
          placeholder={labels.placeholder}
          autoComplete="off"
          spellCheck={false}
          maxLength={100}
          disabled={disabled}
          onChange={e => {
            setText(e.target.value);
            setOpen(true);
            // A new search starts with this key: nothing is active until its
            // answer comes (set here, with the key, not after the render).
            if (e.target.value.trim() !== "") { setState("busy"); setActive(-1); }
            if (!multiple && e.target.value === "" && single) onChange([]);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => { setOpen(false); if (!multiple) setText(single?.name ?? ""); else setText(""); }}
          onKeyDown={onKey}
        />
      </div>
      <ul ref={list} id={listId} role="listbox" aria-label={label} aria-multiselectable={multiple || undefined} aria-busy={state === "busy" || undefined} className="ck-listbox" hidden={!listShown}>
        {recent && ordered.length > 0 && <li role="presentation" className="ck-list-head">{suggestionsLabel ?? labels.recent}</li>}
        {recent ? ordered.map(renderOption) : (
          <>
            {groups.length > 0 && <li role="presentation" className="ck-list-head">{labels.groups}</li>}
            {groups.map(renderOption)}
            {groups.length > 0 && people.length > 0 && <li role="presentation" className="ck-list-head">{labels.people}</li>}
            {people.map(renderOption)}
          </>
        )}
        {typed && state === "idle" && options.length === 0 && <li role="presentation" className="ck-list-empty">{labels.noMatch}</li>}
      </ul>
      <span className="ck-vh" role="status" aria-live="polite">{status}</span>
      {hint && <p id={hintId} className="ck-hint">{hint}</p>}
      {error && <p id={errorId} className="ck-error">{error}</p>}
      {name && value.map(v => <input key={v.id} type="hidden" name={name} value={v.id} />)}
    </div>
  );
}
