"use client";

// DayStrip: the days one can pick soon, as big tappable tiles in a row
// that scrolls sideways on a phone (never the page) — Rooms' strip, made
// general. Links (`href`: the page for that day, works without script) or
// buttons (`onPick`). "Another day…" is the tool's to add (a DateField).
// Server-render safe: names come from the words, the days from the tool.
//
// One Tab stop (0.2.6): the strip is reached once — on the chosen day,
// else today, else the first — and the arrows move along it (Left/Right a
// day, Home/End the ends); Enter or Space chooses (a link is followed).
// Rooms had 27 Tab stops before its first desk. Buttons are a listbox of
// options (`aria-selected`); links stay links in a navigation, the chosen
// one `aria-current="date"`. Until the script runs every link is its own
// Tab stop, as a plain list of links is.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react";
import { formatDate, partsOf, weekday, type IsoDate } from "./dates.js";
import { stripKey } from "./keys.js";
import { en, type DateWords } from "./words.js";

// What a DayStrip gives its link component (Next.js's Link fits as it is).
// A tool's own wrapper passes them on (`props => <Link {...props} scroll={false} />`);
// one that drops `tabIndex` leaves every day a Tab stop, the arrows still work.
export type DayStripLinkProps = { href: string; className?: string; "aria-current"?: "date"; "aria-label": string; tabIndex?: number; children: ReactNode };

export type DayStripProps = {
  readonly days: readonly IsoDate[];
  readonly current: IsoDate | null;
  readonly today: IsoDate;
  readonly href?: (day: IsoDate) => string;
  readonly onPick?: (day: IsoDate) => void;
  // A small mark under a day (a count, a dot): the tool's.
  readonly note?: (day: IsoDate) => ReactNode;
  readonly label?: string;
  readonly labels?: DateWords;
  // Next.js's <Link> as it is, or any component taking these props.
  readonly link?: (props: DayStripLinkProps) => ReactNode;
  readonly children?: ReactNode;
};

export function DayStrip({ days, current, today, href, onPick, note, label, labels = en.date, link, children }: DayStripProps): ReactElement {
  const list = current && !days.includes(current) ? [...days, current].sort() : [...days];
  // The Tab stop: the day last focused while it is still in the list, else
  // the chosen day, else today, else the first.
  const [focused, setFocused] = useState<IsoDate | null>(null);
  const stop = focused && list.includes(focused) ? focused : current && list.includes(current) ? current : list.includes(today) ? today : list[0] ?? null;
  // Links are all Tab stops in the server's page (no script, no arrows);
  // one once the script runs. Buttons need the script anyway.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const roving = ready || !href;
  const row = useRef<HTMLUListElement>(null);

  const tiles = () => [...(row.current?.querySelectorAll<HTMLElement>(".ck-daytile") ?? [])];
  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const all = tiles();
    const at = all.findIndex(t => t === e.target || t.contains(e.target as Node));
    if (at < 0) return;
    if ((e.key === " " || e.key === "Spacebar") && href) {
      // Space follows a link, as it presses a button.
      e.preventDefault();
      all[at]!.click();
      return;
    }
    const next = stripKey(at, all.length, e.key);
    if (next === null) return;
    e.preventDefault();
    all[next]!.focus();
  };
  // The tile that has the focus. A link component written inline
  // (`link={props => <Link {...props} />}`) is a new component each
  // render, so React redraws the tiles and the focus falls to the page
  // when the day chosen re-renders the tool: it is put back on the Tab
  // stop (0.2.6), the keyboard stays in the strip.
  const had = useRef<HTMLElement | null>(null);
  const onFocus = (e: { target: EventTarget }) => {
    const at = tiles().findIndex(t => t === e.target);
    if (at < 0) return;
    had.current = e.target as HTMLElement;
    if (list[at]) setFocused(list[at]!);
  };
  const onBlur = (e: { target: EventTarget; relatedTarget: EventTarget | null }) => {
    const left = e.target as HTMLElement;
    if (e.relatedTarget) {
      if (!row.current?.contains(e.relatedTarget as Node)) had.current = null;
      return;
    }
    // Nothing took the focus: the person clicked the page (the tile is
    // still there), or the tile was redrawn (it is gone).
    setTimeout(() => { if (had.current === left && left.isConnected) had.current = null; }, 0);
  };
  useLayoutEffect(() => {
    const lost = had.current;
    if (!lost || lost.isConnected) return;
    const active = document.activeElement;
    if (active && active !== document.body) { had.current = null; return; }
    const at = stop ? list.indexOf(stop) : -1;
    tiles()[at]?.focus();
  });

  // Rendered as an element, never called: a forwardRef component (Next.js's
  // Link) is an object, not a function.
  const L = link;
  const name = label ?? labels.pickDay;
  const items = list.map(d => {
    const isToday = d === today;
    const body = (
      <>
        <span className="ck-dow">{isToday ? labels.today : labels.weekdaysShort[weekday(d)]}</span>
        <span className="ck-dom">{partsOf(d).day}</span>
        <span className="ck-mon">{labels.monthsShort[partsOf(d).month - 1]}</span>
        {note ? <span className="ck-day-note">{note(d)}</span> : null}
      </>
    );
    const cls = `ck-daytile${isToday ? " ck-is-today" : ""}`;
    const aria = (isToday ? labels.today + ", " : "") + formatDate(d, labels, "long");
    const tabIndex = roving ? (d === stop ? 0 : -1) : undefined;
    const tab = tabIndex === undefined ? {} : { tabIndex };
    return (
      <li key={d} role={href ? undefined : "none"}>
        {href ? (
          L ? <L href={href(d)} className={cls} {...(d === current ? { "aria-current": "date" as const } : {})} aria-label={aria} {...tab}>{body}</L>
            : <a href={href(d)} className={cls} aria-current={d === current ? "date" : undefined} aria-label={aria} {...tab}>{body}</a>
        ) : (
          <button type="button" role="option" className={cls} aria-selected={d === current} aria-label={aria} {...tab} onClick={() => onPick?.(d)}>{body}</button>
        )}
      </li>
    );
  });
  return (
    <div className="ck-daystrip">
      {href ? (
        <nav aria-label={name}>
          <ul ref={row} onKeyDown={onKeyDown} onFocus={onFocus} onBlur={onBlur}>{items}</ul>
        </nav>
      ) : (
        <div className="ck-daystrip-row">
          <ul ref={row} role="listbox" aria-label={name} aria-orientation="horizontal" onKeyDown={onKeyDown} onFocus={onFocus} onBlur={onBlur}>{items}</ul>
        </div>
      )}
      {children ? <div className="ck-daystrip-more">{children}</div> : null}
    </div>
  );
}
