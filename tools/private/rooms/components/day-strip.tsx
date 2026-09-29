import Link from "next/link";
import { formatDay, type Catalogue, type Locale } from "../lib/i18n/index.ts";

// The days one can pick, as a row of links (it scrolls sideways on a
// phone, never the page), and one "Another day…" button that opens a date
// field for any other day.
export function DayStrip({ days, current, today, locale, t, href, hidden = {} }: {
  days: string[];
  current: string;
  today: string;
  locale: Locale;
  t: Catalogue["days"];
  href: (day: string) => string;
  hidden?: Record<string, string>;
}) {
  const list = days.includes(current) ? days : [...days, current].sort();
  return (
    <div className="daystrip">
      <nav aria-label={t.pick}>
        <ul>
          {list.map(d => (
            <li key={d}>
              <Link href={href(d)} aria-current={d === current ? "date" : undefined} className={d === today ? "is-today" : undefined} scroll={false}>
                <span className="dow">{d === today ? t.today : formatDay(d, locale, { weekday: "short" })}</span>
                <span className="dom">{formatDay(d, locale, { day: "numeric" })}</span>
                <span className="mon">{formatDay(d, locale, { month: "short" })}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <details className="other-day">
        <summary className="button quiet small">{t.other}</summary>
        <form method="get" className="other-day-form">
          {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <label htmlFor="other-day" className="visually-hidden">{t.date}</label>
          <input id="other-day" className="field" type="date" name="day" defaultValue={current} required />
          <button type="submit" className="button small">{t.go}</button>
        </form>
      </details>
    </div>
  );
}
