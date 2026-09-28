import { headers } from "next/headers";
import Link from "next/link";
import { CopyButton } from "../../components/copy-button.tsx";
import { Download, kindIcon, Moved } from "../../components/icons.tsx";
import { can } from "../../lib/access.ts";
import * as b from "../../lib/booking.ts";
import { db } from "../../lib/db.ts";
import { clock, intl, plural } from "../../lib/i18n/index.ts";
import { myPage } from "../../lib/my-page.ts";
import { nameOf, people } from "../../lib/people.ts";
import { publicOrigin } from "../../lib/public-origin.ts";
import { viewer } from "../../lib/session.ts";
import { addDays, wall } from "../../lib/zone.ts";

// Bookings: the meetings ahead (or past, or cancelled), day by day, in the
// host's time zone; the link of their page on top.
export default async function BookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t, locale } = v;
  const q = await searchParams;
  const scope: b.Scope = q["show"] === "past" || q["show"] === "cancelled" ? q["show"] : "upcoming";
  const seesAll = can(member, "bookings.all");
  const hosting = can(member, "host");
  const all = seesAll && (q["who"] === "all" || !hosting);
  const sql = db();
  const host = await myPage(v);
  const s = await b.settings(sql);
  const zone = host?.zone ?? s.defaultZone;
  const list = await b.bookings(sql, member, { scope, all });
  const colors = await b.colorsOf(sql, list.map(x => x.typeId));
  const who = all ? await people(list.map(x => x.memberId)) : new Map();
  const origin = publicOrigin(await headers());
  await b.rememberPublicOrigin(sql, origin);
  const link = host ? `${origin ?? ""}/${host.slug}` : "";

  const today = wall(Date.now(), zone).date;
  const groups = new Map<string, b.Booking[]>();
  for (const x of list) {
    const day = wall(x.startsAt, zone).date;
    groups.set(day, [...(groups.get(day) ?? []), x]);
  }
  const dayTitle = (day: string) => new Intl.DateTimeFormat(intl(locale), { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", ...(day.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}) }).format(new Date(day + "T12:00:00Z"));
  const tab = (value: b.Scope) => `/chest?show=${value}${all && hosting ? "&who=all" : ""}`;
  const whoLink = (everyone: boolean) => `/chest${scope === "upcoming" ? "" : "?show=" + scope}${everyone ? (scope === "upcoming" ? "?" : "&") + "who=all" : ""}`;

  return (
    <>
      {host && (
        <section className="ticket" aria-labelledby="page-title">
          <div>
            <h2 id="page-title">{t.bookings.yourPage}</h2>
            {host.away ? <p>{t.bookings.away}</p> : <><p className="address">{link}</p><p className="hint" style={{ color: "inherit", opacity: 0.85 }}>{t.bookings.pageHint}</p></>}
          </div>
          {!host.away && (
            <div className="row">
              <CopyButton text={link} label={t.bookings.copy} done={t.bookings.copied} className="button small" />
              <a className="button small ghost" href={link} target="_blank" rel="noopener">{t.bookings.open}</a>
            </div>
          )}
        </section>
      )}
      <div className="page-head">
        <h1>{t.bookings.title}</h1>
        <div className="row">
          {seesAll && hosting && (
            <nav className="segmented" aria-label={t.bookings.title}>
              <a href={whoLink(false)} aria-current={!all ? "true" : undefined}>{t.bookings.mine}</a>
              <a href={whoLink(true)} aria-current={all ? "true" : undefined}>{t.bookings.everyone}</a>
            </nav>
          )}
          <a className="button quiet small" href={`/chest/export${all ? "?who=all" : ""}`}><Download />{t.bookings.export}</a>
        </div>
      </div>
      {!hosting && <p className="notice calm" style={{ marginBottom: "var(--space-5)" }}>{t.bookings.cannotHost}</p>}
      <nav className="tabs" aria-label={t.bookings.title}>
        {(["upcoming", "past", "cancelled"] as const).map(x => <Link key={x} href={tab(x)} aria-current={x === scope ? "page" : undefined}>{t.bookings.scopes[x]}</Link>)}
      </nav>
      {list.length === 0 ? (
        <div className="empty"><p>{t.bookings.empty[scope]}</p></div>
      ) : (
        <div className="agenda">
          {[...groups].map(([day, items]) => (
            <section key={day} className="day" aria-labelledby={`d-${day}`}>
              <h2 id={`d-${day}`}>
                {dayTitle(day)}
                {day === today && <span className="tag today">{t.bookings.today}</span>}
                {day === addDays(today, 1) && <span className="tag">{t.bookings.tomorrow}</span>}
              </h2>
              <ul className="meetings">
                {items.map(x => {
                  const Kind = kindIcon[x.locationKind];
                  const color = (x.typeId && colors.get(x.typeId)) || "slate";
                  return (
                    <li key={x.id}>
                      <Link className={`meeting${x.status === "cancelled" ? " cancelled" : ""}`} href={`/chest/bookings/${x.id}`} style={{ "--type": `var(--c-${color})` } as React.CSSProperties}>
                        <span className="time num">{clock(x.startsAt, zone, locale)}<small>{plural(t.minutes, x.duration, locale)}</small></span>
                        <span>
                          <span className="who-line">{x.guestName}</span>
                          <span className="what"><Kind />{x.title}{all && <> · {nameOf(who.get(x.memberId), locale)}</>}</span>
                        </span>
                        <span className="row">
                          {x.moves > 0 && x.status === "confirmed" && <span className="tag"><Moved />{t.bookings.moved}</span>}
                          {x.status === "cancelled" && x.cancelledBy && <span className="tag danger">{t.booking.cancelledBy[x.cancelledBy]}</span>}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
