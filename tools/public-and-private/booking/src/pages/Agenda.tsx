import { EmptyState, PageHeader, Segmented, StatusBadge, Tabs } from "@argentic/chest-ui/components";
import { timeText } from "@argentic/chest-ui/components/logic";
import { Alert, CalendarOff, Download, kindIcon, Moved, Plus } from "../components/icons.tsx";
import type { PageContext, View } from "@argentic/chest-app";
import { Island } from "@argentic/chest-app";
import type { MemberContext } from "@argentic/chest-app";
import { clock, dayWords, endClock, format, isLocale, plural, relative, localeOf } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import * as b from "../lib/booking.ts";
import * as calendars from "../lib/calendars.ts";
import { db } from "../lib/db.ts";
import { myPage } from "../lib/my-page.ts";
import { nameOf, people } from "../lib/people.ts";
import { publicOrigin } from "../lib/public-origin.ts";
import { addDays, instantOf, wall } from "../lib/zone.ts";
import { typeClass } from "../shared/kinds.ts";

type Item = { kind: "booking"; at: Date; booking: b.Booking } | { kind: "block"; at: Date; block: b.Block } | { kind: "free"; at: Date; day: string; start: number; end: number } | { kind: "busy"; at: Date; day: string; start: number; end: number; source: string };

// Bookings: the meetings ahead (or past, or cancelled), day by day, in the
// host's time zone; the link of their page on top. A new host's first
// screen asks for their calendar first (FirstRun). On the host's own view
// of what is to come, the coming week's free stretches show between the
// meetings — tap one to block it (the AgendaTools island) — and the busy
// times of their other calendars as grey rows.
export async function agendaPage(v: PageContext<MemberContext>): Promise<View> {
  const { member, t, request, query } = v;
  const locale = localeOf(v.locale);
  const shown = query("show");
  const scope: b.Scope = shown === "past" || shown === "cancelled" ? shown : "upcoming";
  const seesAll = can(member, "bookings.all");
  const hosting = can(member, "host");
  const all = seesAll && (query("who") === "all" || !hosting);
  const sql = db();
  const host = await myPage(v);
  const s = await b.settings(sql);
  const zone = host?.zone ?? s.defaultZone;
  const list = await b.bookings(sql, member, { scope, all });
  const colors = await b.colorsOf(sql, list.map(x => x.typeId));
  // One type, one name: each type in the reader's language, whatever
  // language its guests booked in (their language is a small tag).
  const names = await b.typeNames(sql, list.map(x => x.typeId), locale);
  const who = all ? await people(list.map(x => x.memberId)) : new Map();
  const origin = publicOrigin(request.headers);
  await b.rememberPublicOrigin(sql, origin);
  const link = host ? `${origin ?? ""}/${host.slug}` : "";

  // The host's own view of what is to come also shows the times they
  // blocked, and warns when one of their calendars cannot be read.
  const own = host !== null && !host.away && !all && scope === "upcoming";
  const blocks = own ? await b.blocksOf(sql, member.id) : [];
  // The coming week's free stretches: tap one to block it.
  const free = own && host ? await b.freeStretches(sql, host) : new Map<string, { start: number; end: number }[]>();
  // What keeps the host busy elsewhere in those days (their other
  // calendars, another tool): grey rows, so a hole is never a mystery.
  const elsewhere = own && host ? await b.busyElsewhere(sql, host) : [];
  const stale = host ? (await calendars.calendarsOf(sql, member.id)).find(c => c.stale) : undefined;
  const today = wall(Date.now(), zone).date;
  const freeItems: Item[] = [...free].flatMap(([day, windows]) => windows.map(w => ({ kind: "free" as const, at: instantOf(day, w.start, zone), day, start: w.start, end: w.end })));
  const busyItems: Item[] = elsewhere.map(e => ({ kind: "busy" as const, at: instantOf(e.day, e.start, zone), ...e }));
  const items: Item[] = [...list.map(x => ({ kind: "booking" as const, at: x.startsAt, booking: x })), ...blocks.map(x => ({ kind: "block" as const, at: x.start, block: x })), ...freeItems, ...busyItems];
  const quiet = (x: Item) => x.kind === "free" || x.kind === "busy";
  // Where a busy time comes from, in words.
  const whereBusy = (source: string) => {
    const w = t.bookings.busyWhere;
    if (source === "calendar.google.com") return w.google;
    if (source.startsWith("outlook.")) return w.outlook;
    if (source.endsWith("icloud.com")) return w.apple;
    if (source === "tool:hiring") return w.hiring;
    // Leave tells times only, never the kind of leave: "Off".
    if (source === "tool:leave") return w.leave;
    return source.startsWith("tool:") ? w.tool : w.other;
  };
  // A block in the host's clock: its day, from, to (24:00 when it ends at
  // midnight or later).
  const clockOf = (k: b.Block) => {
    const from = wall(k.start, zone), to = wall(k.end, zone);
    return { day: from.date, start: from.minutes, end: to.date === from.date ? to.minutes : 1440 };
  };
  if (scope === "upcoming") items.sort((p, q) => p.at.getTime() - q.at.getTime());
  const groups = new Map<string, Item[]>();
  for (const x of items) {
    const day = wall(x.at, zone).date;
    groups.set(day, [...(groups.get(day) ?? []), x]);
  }
  const dayTitle = (day: string) => dayWords(day, locale, { weekday: "long", day: "numeric", month: "long", ...(day.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}) });
  const tab = (value: b.Scope) => `/chest?show=${value}${all && hosting ? "&who=all" : ""}`;
  const whoLink = (everyone: boolean) => `/chest${scope === "upcoming" ? "" : "?show=" + scope}${everyone ? (scope === "upcoming" ? "?" : "&") + "who=all" : ""}`;
  // What blocking a time sends to the agenda's island (a free stretch's
  // button, "Block a time"): its day and hours, as data.
  const asks = (day: string, start: number, end: number) => JSON.stringify({ day, start, end });

  const body = (
    <>
      {host && !host.away && !host.ready && <Island name="FirstRun" props={{ t: { first: t.first, others: t.others } }} />}
      {host && (host.away || host.ready) && (
        <section className="ticket" aria-labelledby="page-title">
          <div>
            <h2 id="page-title">{t.bookings.yourPage}</h2>
            {host.away ? <p>{t.bookings.away}</p> : <><p className="address">{link}</p><p className="ticket-hint">{t.bookings.pageHint}</p></>}
          </div>
          {!host.away && (
            <div className="row">
              <Island name="CopyButton" props={{ text: link, label: t.bookings.copy, done: t.bookings.copied, className: "button small" }} />
              <a className="button small ghost" href={link} target="_blank" rel="noopener">{t.bookings.open}</a>
            </div>
          )}
        </section>
      )}
      <PageHeader size="m"
        title={t.bookings.title}
        secondary={<>
          {seesAll && hosting && (
            // Mine or everyone's: the kit's Segmented, its link variant (the
            // choice is in the address, shareable, Back works).
            <Segmented label={t.bookings.whose} value={all ? "all" : "mine"}
              options={[{ value: "mine", label: t.bookings.mine, href: whoLink(false) }, { value: "all", label: t.bookings.everyone, href: whoLink(true) }]} />
          )}
          {own && <button type="button" className="button quiet small" data-block={asks(today, 600, 660)}><CalendarOff />{t.bookings.blockTime}</button>}
        </>}
        action={host && !host.away ? <a className="button small" href="/chest/new"><Plus />{t.bookings.newBooking}</a> : null}
      />
      {stale && (
        <p className="notice spaced" role="status">
          <Alert />
          <span>
            {stale.readAt ? format(t.bookings.staleCalendar, { calendar: stale.provider, when: relative(stale.readAt, locale) }) : format(t.bookings.unreadCalendar, { calendar: stale.provider })}
            {" "}<a href="/chest/hours#calendars">{t.bookings.checkCalendar}</a>
          </span>
        </p>
      )}
      {!hosting && <p className="notice calm spaced">{t.bookings.cannotHost}</p>}
      <Tabs label={t.bookings.show} current={scope} items={(["upcoming", "past", "cancelled"] as const).map(x => ({ id: x, label: t.bookings.scopes[x], href: tab(x) }))} />
      {items.length === 0 ? (
        <EmptyState title={t.bookings.empty[scope]} body={scope === "upcoming" && host && host.ready && !host.away && !all ? t.bookings.emptyHint : undefined} />
      ) : (
        // On a phone, where meetings are the main thing, the free stretches
        // (and the busy times of other calendars beside them) fold away
        // behind "Show free times" (the FreeToggle island, remembered on
        // this device; src/styles.css); a computer shows them all.
        <div className="agenda-wrap">
          {freeItems.length + busyItems.length > 0 && <Island name="FreeToggle" props={{ label: t.bookings.showFree }} />}
          <div className="agenda">
            {[...groups].map(([day, items]) => (
              <section key={day} id={`day-${day}`} className={`day${items.every(quiet) ? " only-free" : ""}`} aria-labelledby={`d-${day}`}>
                <h2 id={`d-${day}`}>
                  {dayTitle(day)}
                  {day === today && <span className="tag today">{t.bookings.today}</span>}
                  {day === addDays(today, 1) && <span className="tag">{t.bookings.tomorrow}</span>}
                </h2>
                <ul className="meetings">
                  {items.map(item => {
                    if (item.kind === "block") {
                      const k = item.block;
                      const c = clockOf(k);
                      const label = `${dayTitle(c.day)}, ${clock(k.start, zone, locale)}–${endClock(k.start, k.end, zone, locale)}`;
                      return (
                        <li key={"block-" + k.id} id={"block-" + k.id}>
                          <div className="meeting blocked">
                            <span className="time num">{timeText(c.start)}<small>{timeText(c.end)}</small></span>
                            <span>
                              <span className="who-line">{t.bookings.blocked}</span>
                              {k.note && <span className="what">{k.note}</span>}
                            </span>
                            <span className="row">
                              <button type="button" className="link-button" data-unblock={JSON.stringify({ id: k.id, day: c.day, start: c.start, end: c.end, note: k.note })} aria-label={format(t.bookings.unblockLabel, { time: label })}>{t.bookings.unblock}</button>
                            </span>
                          </div>
                        </li>
                      );
                    }
                    if (item.kind === "free") {
                      const range = `${timeText(item.start)}–${timeText(item.end)}`;
                      return (
                        <li key={`free-${item.day}-${item.start}`} id={`free-${item.day}-${item.start}`} className="free-row">
                          {/* Tap to block: the dialog opens on its first hour, never past its end. */}
                          <button type="button" className="meeting free" data-block={asks(item.day, item.start, Math.min(item.end, item.start + 60))} aria-label={format(t.bookings.freeLabel, { range })}>
                            <span className="time num">{timeText(item.start)}<small>{timeText(item.end)}</small></span>
                            <span className="who-line">{t.bookings.free}</span>
                            <span className="row"><span className="tag"><Plus />{t.bookings.block}</span></span>
                          </button>
                        </li>
                      );
                    }
                    if (item.kind === "busy") {
                      const where = whereBusy(item.source);
                      return (
                        <li key={`busy-${item.day}-${item.start}-${item.source}`} id={`busy-${item.day}-${item.start}-${item.source}`} className="free-row">
                          <div className="meeting elsewhere" role="group" aria-label={format(t.bookings.busyLabel, { range: `${timeText(item.start)}–${timeText(item.end)}`, where })}>
                            <span className="time num">{timeText(item.start)}<small>{timeText(item.end)}</small></span>
                            <span>
                              <span className="who-line">{t.bookings.busy}</span>
                              <span className="what"><CalendarOff />{where}</span>
                            </span>
                          </div>
                        </li>
                      );
                    }
                    const x = item.booking;
                    const Kind = kindIcon[x.locationKind];
                    const color = (x.typeId && colors.get(x.typeId)) || "slate";
                    return (
                      <li key={x.id} id={"booking-" + x.id}>
                        <a className={`meeting ${typeClass[color]}${x.status === "cancelled" ? " cancelled" : ""}`} href={`/chest/bookings/${x.id}`}>
                          <span className="time num">{clock(x.startsAt, zone, locale)}<small>{plural(t.minutes, x.duration, locale)}</small></span>
                          <span>
                            <span className="who-line">{x.guestName}</span>
                            <span className="what"><Kind />{(x.typeId && names.get(x.typeId)) || x.title}{all && <> · {nameOf(who.get(x.memberId), locale)}</>}
                              {isLocale(x.guestLanguage) && x.guestLanguage !== locale && <span className="tag lang"><span aria-hidden="true">{x.guestLanguage.toUpperCase()}</span><span className="visually-hidden">{format(t.bookings.guestLanguage, { language: t.languages[x.guestLanguage] })}</span></span>}
                            </span>
                          </span>
                          <span className="row">
                            {x.moves > 0 && x.status === "confirmed" && <span className="tag"><Moved />{t.bookings.moved}</span>}
                            {x.status === "cancelled" && x.cancelledBy && <StatusBadge tone="danger" size="s" label={t.booking.cancelledBy[x.cancelledBy]} />}
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
      {/* A rare act: at the foot of the list, never above it. */}
      {(hosting || seesAll) && <p className="agenda-foot"><a className="link-button" href={`/chest/export${all ? "?who=all" : ""}`}><Download />{t.bookings.export}</a></p>}
      {/* Blocking a time (from a free stretch, "Block a time") and freeing
          one, with Undo: one island for the whole agenda. */}
      {own && <Island name="AgendaTools" props={{ today, t: { hours: t.hours, bookings: t.bookings, date: t.kit.date, dialog: t.kit.dialog, invalid: t.errors.invalid } }} />}
    </>
  );
  return { title: t.bookings.title, body };
}
