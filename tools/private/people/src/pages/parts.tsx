import { Avatar } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { Back, Cake, Star, Wave } from "../components/icons.tsx";
import { percent } from "../shared/model.ts";

// Pieces several pages share, rendered on the server (no script).

// "← The team": the way back, at the top of a page.
export function BackLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return <a className={className ? `back ${className}` : "back"} href={href}><Back />{children}</a>;
}

// A progress bar of a checklist: a class per percent (pct-0…pct-100,
// src/styles.css), never a style attribute; the figures are written next
// to it.
export function Meter({ done, total, big = false }: { done: number; total: number; big?: boolean }) {
  return <span className={big ? "meter big" : "meter"} aria-hidden="true"><span className={`pct-${percent(done, total)}`} /></span>;
}

// This month's birthdays and anniversaries, and who arrives soon (the
// directory's foot).
export type Moment = { key: string; href: string; name: string; photo: string | null; past: boolean; birthday: boolean; line: string; date: string };
export type Arriving = { key: string; href: string; name: string; photo: string | null; source: string | null; line: string; date: string };
export function Moments({ month, soon, t }: { month: Moment[]; soon: Arriving[]; t: { thisMonth: string; arriving: string } }) {
  if (month.length === 0 && soon.length === 0) return null;
  return (
    <div className="moments">
      {month.length > 0 && (
        <section aria-labelledby="month-title">
          <h2 id="month-title" className="eyebrow"><Star />{t.thisMonth}</h2>
          <ul className="moment-list">
            {month.map(m => (
              <li key={m.key} className={m.past ? "past" : undefined}>
                <a href={m.href}>
                  <Avatar name={m.name} photo={m.photo} size="l" />
                  <span className="moment-text">
                    <strong>{m.name}</strong>
                    <span className="muted">{m.birthday ? <Cake /> : <Star />} {m.line}</span>
                  </span>
                  <span className="moment-date">{m.date}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {soon.length > 0 && (
        <section aria-labelledby="soon-title">
          <h2 id="soon-title" className="eyebrow"><Wave />{t.arriving}</h2>
          <ul className="moment-list">
            {soon.map(e => (
              <li key={e.key}>
                <a href={e.href}>
                  <Avatar name={e.name} photo={e.photo} size="l" />
                  <span className="moment-text">
                    <strong>{e.name}{e.source && <span className="source">{e.source}</span>}</strong>
                    <span className="muted">{e.line}</span>
                  </span>
                  <span className="moment-date">{e.date}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
