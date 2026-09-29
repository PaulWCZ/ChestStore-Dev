"use client";

// Small pieces every tool shows: the empty state, a state's badge, tabs
// with counts, a segmented choice.
import { useId, useRef, type ReactElement, type ReactNode } from "react";
import type { LinkComponent } from "./shell.js";
import { StateIcon } from "./icons.js";
import { tabKey } from "./keys.js";
import { en, type ShellWords } from "./words.js";

// EmptyState: an empty list is not a blank page. It says what the place is
// for and offers the first action — only to whoever may do it (pass
// `action` when the viewer can; otherwise `note` says who can: "An admin
// adds the rooms."). "Start with an example" fills it in one click.
export function EmptyState({ title, body, action, example, note, icon, headingLevel = 2, labels = en.shell }: {
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  example?: { label?: string; onClick?: () => void; href?: string; busy?: boolean } | null;
  note?: ReactNode;
  icon?: ReactNode;
  headingLevel?: 1 | 2 | 3;
  labels?: Pick<ShellWords, "example">;
}): ReactElement {
  const H = `h${headingLevel}` as "h1" | "h2" | "h3";
  const exampleLabel = example?.label ?? labels.example;
  return (
    <div className="ck-empty">
      {icon ? <div className="ck-empty-icon" aria-hidden="true">{icon}</div> : null}
      <H className="ck-empty-title">{title}</H>
      {body ? <p className="ck-empty-body">{body}</p> : null}
      {(action || example) && (
        <div className="ck-empty-actions">
          {action}
          {example && (example.href
            ? <a className="ck-button ck-button-quiet" href={example.href}>{exampleLabel}</a>
            : <button type="button" className="ck-button ck-button-quiet" disabled={example.busy} aria-busy={example.busy || undefined} onClick={example.onClick}>{exampleLabel}</button>)}
        </div>
      )}
      {note ? <p className="ck-empty-note">{note}</p> : null}
    </div>
  );
}

export type Tone = "ok" | "wait" | "danger" | "info" | "neutral";

// StatusBadge: a state as people read it — its shape and its word, in its
// colour. Never the colour alone (in the Chest theme states have no colour
// at all). `category` (1–8) paints a category chip instead (a label, a
// kind of leave): its word is the only thing that tells it; `icon` then
// replaces its dot (0.2.2). `empty`: the dashed badge of what is not there
// yet ("No owner yet", "Not rated") — no ground, a dashed edge (0.2.2).
export function StatusBadge({ tone = "neutral", label, category, icon, size = "m", empty = false, className }: { tone?: Tone; label: string; category?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; icon?: ReactNode | false; size?: "s" | "m"; empty?: boolean; className?: string }): ReactElement {
  const extra = `${empty ? " ck-badge-empty" : ""}${className ? " " + className : ""}`;
  if (category) return <span className={`ck-badge ck-badge-${size} ck-cat-${category}${extra}`}>{icon === false ? null : icon ?? <span className="ck-cat-dot" aria-hidden="true" />}{label}</span>;
  return (
    <span className={`ck-badge ck-badge-${size} ck-tone-${tone}${extra}`}>
      {icon === false ? null : icon ?? <StateIcon tone={tone} />}
      {label}
    </span>
  );
}

// The link Tabs gives: Next's Link, a LinkComponent, or an inline wrapper.
type TabLink = (props: { href: string; className?: string; "aria-current"?: "page"; children: ReactNode }) => ReactNode;

export type TabItem = { readonly id: string; readonly label: string; readonly count?: number; readonly href?: string };

// Tabs: sections of one page, with their counts ("Upcoming 3 · Past ·
// Cancelled 1"). With `href` on the items they are links (the address
// keeps the tab; `current` is the shown one) — the usual case in a tool;
// otherwise a tab list with a roving focus (arrows, Home, End) that shows
// `children` as the chosen tab's panel.
export function Tabs({ items, current, onChange, label, children, link, className }: {
  items: readonly TabItem[];
  current: string;
  onChange?: (id: string) => void;
  label: string;
  children?: ReactNode;
  // Next.js's <Link> as it is, or any component taking these props — a
  // client reference a server component may pass (0.2.2: LinkComponent).
  // (One function type, so an inline `props => <Link {...props} />` is
  // typed from it; a LinkComponent fits it too.)
  link?: TabLink;
  className?: string;
}): ReactElement {
  const base = useId();
  const list = useRef<HTMLDivElement>(null);
  const count = (n: number | undefined) => (n === undefined ? null : <span className="ck-count">{n}</span>);
  if (items.every(i => i.href)) {
    const A: TabLink = link ?? (p => <a {...p} />);
    return (
      <nav className={`ck-tabs${className ? " " + className : ""}`} aria-label={label}>
        <ul>
          {items.map(i => (
            <li key={i.id}>
              <A href={i.href!} className="ck-tab" {...(i.id === current ? { "aria-current": "page" as const } : {})}>
                <span>{i.label}</span>{count(i.count)}
              </A>
            </li>
          ))}
        </ul>
      </nav>
    );
  }
  const index = Math.max(0, items.findIndex(i => i.id === current));
  const move = (key: string) => {
    const next = tabKey(index, items.length, key);
    if (next === null) return false;
    onChange?.(items[next]!.id);
    list.current?.querySelectorAll<HTMLElement>("[role=tab]")[next]?.focus();
    return true;
  };
  return (
    <div className={`ck-tabs-block${className ? " " + className : ""}`}>
      <div ref={list} className="ck-tabs ck-tablist" role="tablist" aria-label={label} onKeyDown={e => { if (move(e.key)) e.preventDefault(); }}>
        {items.map((i, n) => (
          <button key={i.id} type="button" role="tab" id={`${base}-tab-${i.id}`} aria-selected={n === index} aria-controls={`${base}-panel`} tabIndex={n === index ? 0 : -1} className="ck-tab" onClick={() => onChange?.(i.id)}>
            <span>{i.label}</span>{count(i.count)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${items[index]?.id ?? ""}`} tabIndex={0} className="ck-tabpanel">{children}</div>
    </div>
  );
}

// Segmented: one choice out of two or three shown side by side (Board /
// List, Morning / Afternoon / Day). Native radios: arrows, Space and forms
// work as everywhere. Four options at most — more is a select.
// `disabled`: the whole choice, or one option (`disabled` on it) (0.2.1).
//
// It is controlled: what it shows is `value`. A tool whose onChange starts
// something slow (a server action, then a refresh) must change the value it
// passes at once — its own state, or React's useOptimistic — or the choice
// shows the old value until the answer comes, then jumps (0.2.2, People).
// A choice that changes the page's address (a view: Board / List) is the
// link variant: options with `href` are links, the current one marked
// (aria-current), and no state at all (0.2.2).
export type SegmentedOption<V extends string> = { readonly value: V; readonly label: string; readonly icon?: ReactNode; readonly disabled?: boolean; readonly href?: string };

export function Segmented<V extends string>({ label, options, value, onChange, name, hideLabel = true, disabled = false, link, className }: {
  label: string;
  options: readonly SegmentedOption<V>[];
  value: V;
  onChange?: (value: V) => void;
  name?: string;
  hideLabel?: boolean;
  disabled?: boolean;
  // The link variant's link component (Next.js's Link as it is).
  link?: LinkComponent;
  className?: string;
}): ReactElement {
  const auto = useId();
  const group = name ?? auto;
  if (options.length > 4) throw new RangeError("Segmented takes 2 to 4 options; use a select for more");
  const cls = className ? " " + className : "";
  if (options.length > 0 && options.every(o => o.href)) {
    const A: LinkComponent = link ?? (p => <a {...p} />);
    return (
      <nav className={`ck-segmented ck-segmented-links${cls}`} aria-label={label}>
        {hideLabel ? null : <span className="ck-label" aria-hidden="true">{label}</span>}
        <div className="ck-segments">
          {options.map(o => (
            <A key={o.value} href={o.href!} className="ck-segment-link" {...(o.value === value ? { "aria-current": "page" as const } : {})}>
              <span>{o.icon}{o.label}</span>
            </A>
          ))}
        </div>
      </nav>
    );
  }
  return (
    <fieldset className={`ck-segmented${cls}`} disabled={disabled || undefined}>
      <legend className={hideLabel ? "ck-vh" : "ck-label"}>{label}</legend>
      <div className="ck-segments">
        {options.map(o => (
          <label key={o.value} className="ck-segment">
            <input type="radio" name={group} value={o.value} checked={o.value === value} disabled={o.disabled || undefined} onChange={() => onChange?.(o.value)} />
            <span>{o.icon}{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// Switch: something on or off that takes effect at once (Notify me by
// email, Accept answers) — a checkbox with the switch role: Space toggles,
// a form sends `value` when on. Its label says what is on; `hint` a line
// under it. Not for a choice that waits for a Save: that is a checkbox
// (0.2.2, Forms).
export function Switch({ label, checked, onChange, name, value = "on", hint, disabled = false, id, className }: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  name?: string;
  value?: string;
  hint?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
}): ReactElement {
  const auto = useId();
  const fieldId = id ?? auto + "-switch";
  return (
    <div className={`ck-switch${className ? " " + className : ""}`}>
      <input id={fieldId} type="checkbox" role="switch" className="ck-switch-input" name={name} value={value} checked={checked} disabled={disabled || undefined}
        aria-describedby={hint ? auto + "-hint" : undefined} onChange={e => onChange(e.currentTarget.checked)} />
      <label htmlFor={fieldId} className="ck-switch-label">
        <span className="ck-switch-track" aria-hidden="true"><span className="ck-switch-thumb" /></span>
        <span className="ck-switch-text">{label}</span>
      </label>
      {hint ? <p id={auto + "-hint"} className="ck-hint">{hint}</p> : null}
    </div>
  );
}

// Checkbox: something on or off that waits for the form's Save (0.2.3) —
// "Billable", "Ask for a receipt" in a form sent on submit. The rule
// (Forms, Timesheets): an act that takes effect at once is a Switch; a
// choice that waits for a Save is a checkbox, which never looks like it
// already did something. A native checkbox (Space toggles, a form sends
// `value` when ticked), drawn at 20 px with the accent, its words the
// 44 px target. Controlled (`checked` + `onChange`) or left to the form
// (`defaultChecked`, no script needed).
export function Checkbox({ label, checked, defaultChecked, onChange, name, value = "on", hint, disabled = false, required = false, id, className }: {
  label: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  name?: string;
  value?: string;
  hint?: ReactNode;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
}): ReactElement {
  const auto = useId();
  const fieldId = id ?? auto + "-check";
  return (
    <div className={`ck-check${className ? " " + className : ""}`}>
      <input id={fieldId} type="checkbox" className="ck-check-input" name={name} value={value} disabled={disabled || undefined} required={required || undefined}
        {...(checked !== undefined ? { checked } : {})} {...(defaultChecked !== undefined ? { defaultChecked } : {})}
        aria-describedby={hint ? auto + "-hint" : undefined} onChange={onChange ? e => onChange(e.currentTarget.checked) : undefined} readOnly={checked !== undefined && !onChange ? true : undefined} />
      <label htmlFor={fieldId} className="ck-check-label">{label}</label>
      {hint ? <p id={auto + "-hint"} className="ck-hint">{hint}</p> : null}
    </div>
  );
}
