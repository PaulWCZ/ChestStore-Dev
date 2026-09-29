"use client";

// Small pieces every tool shows: the empty state, a state's badge, tabs
// with counts, a segmented choice.
import { useId, useRef, type ReactElement, type ReactNode } from "react";
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
// kind of leave): its word is the only thing that tells it.
export function StatusBadge({ tone = "neutral", label, category, icon, size = "m" }: { tone?: Tone; label: string; category?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; icon?: ReactNode | false; size?: "s" | "m" }): ReactElement {
  if (category) return <span className={`ck-badge ck-badge-${size} ck-cat-${category}`}><span className="ck-cat-dot" aria-hidden="true" />{label}</span>;
  return (
    <span className={`ck-badge ck-badge-${size} ck-tone-${tone}`}>
      {icon === false ? null : icon ?? <StateIcon tone={tone} />}
      {label}
    </span>
  );
}

export type TabItem = { readonly id: string; readonly label: string; readonly count?: number; readonly href?: string };

// Tabs: sections of one page, with their counts ("Upcoming 3 · Past ·
// Cancelled 1"). With `href` on the items they are links (the address
// keeps the tab; `current` is the shown one) — the usual case in a tool;
// otherwise a tab list with a roving focus (arrows, Home, End) that shows
// `children` as the chosen tab's panel.
export function Tabs({ items, current, onChange, label, children, link }: {
  items: readonly TabItem[];
  current: string;
  onChange?: (id: string) => void;
  label: string;
  children?: ReactNode;
  // Next.js's <Link> as it is, or any component taking these props.
  link?: (props: { href: string; className?: string; "aria-current"?: "page"; children: ReactNode }) => ReactNode;
}): ReactElement {
  const base = useId();
  const list = useRef<HTMLDivElement>(null);
  const count = (n: number | undefined) => (n === undefined ? null : <span className="ck-count">{n}</span>);
  if (items.every(i => i.href)) {
    const A = link ?? ((p: { href: string; className?: string; "aria-current"?: "page"; children: ReactNode }) => <a {...p} />);
    return (
      <nav className="ck-tabs" aria-label={label}>
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
    <div className="ck-tabs-block">
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
export function Segmented<V extends string>({ label, options, value, onChange, name, hideLabel = true, disabled = false }: {
  label: string;
  options: readonly { readonly value: V; readonly label: string; readonly icon?: ReactNode; readonly disabled?: boolean }[];
  value: V;
  onChange: (value: V) => void;
  name?: string;
  hideLabel?: boolean;
  disabled?: boolean;
}): ReactElement {
  const auto = useId();
  const group = name ?? auto;
  if (options.length > 4) throw new RangeError("Segmented takes 2 to 4 options; use a select for more");
  return (
    <fieldset className="ck-segmented" disabled={disabled || undefined}>
      <legend className={hideLabel ? "ck-vh" : "ck-label"}>{label}</legend>
      <div className="ck-segments">
        {options.map(o => (
          <label key={o.value} className="ck-segment">
            <input type="radio" name={group} value={o.value} checked={o.value === value} disabled={o.disabled || undefined} onChange={() => onChange(o.value)} />
            <span>{o.icon}{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
