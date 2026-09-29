// DayStrip: the days one can pick soon, as big tappable tiles in a row
// that scrolls sideways on a phone (never the page) — Rooms' strip, made
// general. Links (`href`: the page for that day, works without script) or
// buttons (`onPick`). "Another day…" is the tool's to add (a DateField).
// Server-render safe: names come from the words, the days from the tool.
import type { ReactElement, ReactNode } from "react";
import { formatDate, partsOf, weekday, type IsoDate } from "./dates.js";
import { en, type DateWords } from "./words.js";

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
  readonly link?: (props: { href: string; className?: string; "aria-current"?: "date"; "aria-label": string; children: ReactNode }) => ReactNode;
  readonly children?: ReactNode;
};

export function DayStrip({ days, current, today, href, onPick, note, label, labels = en.date, link, children }: DayStripProps): ReactElement {
  const list = current && !days.includes(current) ? [...days, current].sort() : [...days];
  // Rendered as an element, never called: a forwardRef component (Next.js's
  // Link) is an object, not a function.
  const L = link;
  return (
    <div className="ck-daystrip">
      <nav aria-label={label ?? labels.pickDay}>
        <ul>
          {list.map(d => {
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
            return (
              <li key={d}>
                {href ? (
                  L ? <L href={href(d)} className={cls} {...(d === current ? { "aria-current": "date" as const } : {})} aria-label={aria}>{body}</L>
                    : <a href={href(d)} className={cls} aria-current={d === current ? "date" : undefined} aria-label={aria}>{body}</a>
                ) : (
                  <button type="button" className={cls} aria-pressed={d === current} aria-label={aria} onClick={() => onPick?.(d)}>{body}</button>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      {children ? <div className="ck-daystrip-more">{children}</div> : null}
    </div>
  );
}
