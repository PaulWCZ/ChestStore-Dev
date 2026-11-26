import { chest } from "@argentic/chest-sdk/chest";
import { CalendarPlus, Clock, Info, Party } from "../components/icons.tsx";
import type { View } from "@argentic/chest-app";
import { Island } from "@argentic/chest-app";
import { AppError, notFound, type Cookies } from "@argentic/chest-app";
import { fill as format, type Catalogue, type Locale } from "../i18n/index.ts";
import { guestMailOffered } from "../lib/agenda.ts";
import { dates, optionText } from "../lib/dates.ts";
import type { Sql } from "../lib/db.ts";
import { guestCookie } from "../lib/guest-cookie.ts";
import { byLink, mine } from "../lib/guests.ts";
import { nameOf, people } from "../lib/people.ts";
import { placesTaken, type Poll } from "../lib/polls.ts";
import { chestZone } from "../lib/zone.ts";
import { sheetOf } from "../theme.ts";
import { PublicTop } from "./PublicTop.tsx";

// A date poll's page for guests (lib/guests.ts): on the public host,
// without an account. It shows the poll's words, the dates and the
// guest's own answer — never the other answers nor the team's names (only
// the organiser's, who shared the link). Its language is the visitor's
// (the switch, then the browser's); its look the company's brand or Polls'
// own, never a theme chosen for the team.
export async function guestPage({ sql, t, locale, cookies }: { sql: Sql; t: Catalogue; locale: Locale; cookies: Cookies }, link: string, sent: string | undefined): Promise<View> {
  const { look } = await sheetOf("public");
  let poll: Poll;
  try {
    poll = await byLink(sql, link);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }
  const zone = chestZone();
  const d = dates(locale, zone);
  const range = { range: t.dates.range, dayAndTime: t.dates.dayAndTime };
  const secret = cookies.get(guestCookie(poll.id));
  const me = await mine(sql, poll, secret);
  const organiser = nameOf((await people([poll.organiser])).get(poll.organiser), locale);
  const company = chest.organization.name;
  const q = poll.questions[0]!;
  const taken = poll.slots === null ? null : await placesTaken(sql, poll);
  const final = poll.finalOption ? q.options.find(o => o.id === poll.finalOption) : undefined;
  const options = q.options.map(o => ({
    id: o.id,
    month: d.month(o.day!), day: d.dayNumber(o.day!), weekday: d.weekday(o.day!), text: d.dayLong(o.day!),
    hours: d.hours({ day: o.day!, start: o.start, end: o.end }, t.dates.range) || t.dates.allDay,
    // Places left for this guest (their own "yes" counts as theirs).
    left: poll.slots === null || taken === null ? null : Math.max(0, poll.slots - (taken[o.id] ?? 0) + (me?.dates[o.id] === 2 ? 1 : 0)),
  }));
  const back = `/p/${link}`;
  const mailOn = poll.status === "open" ? await guestMailOffered() : false;

  return { title: poll.title, body: (
    <div className="guest">
      {/* A company's logo already says its name: the name only beside Polls' mark. */}
      <PublicTop logo={look.logo} name={company || t.tool.name} locale={locale} back={back} t={t} />
      <header className="poll-head">
        <h1>{poll.title}</h1>
        {poll.details && <p className="details">{poll.details}</p>}
        <div className="meta">
          <span>{format(t.guest.askedBy, { name: organiser })}</span>
          <span><Clock />{poll.status === "closed" ? format(t.poll.closedOn, { date: d.at(poll.closedAt!) }) : poll.closesAt ? format(t.poll.closes, { date: d.at(poll.closesAt) }) : t.poll.noClose}</span>
        </div>
      </header>

      {final ? (
        <div className="final-card">
          <span className="eyebrow">{t.final.chosen}</span>
          <strong>{optionText({ day: final.day!, start: final.start, end: final.end }, locale, zone, range)}</strong>
          <div className="row"><a className="button small" href={`/p/${link}/calendar`} download><CalendarPlus />{t.final.calendar}</a></div>
        </div>
      ) : poll.status === "closed" ? (
        <p className="note"><Info />{t.guest.closed}</p>
      ) : null}

      {poll.status === "open" ? (
        <Island name="GuestForm" props={{
          link,
          pollId: poll.id,
          options,
          signup: poll.slots !== null,
          mailOn,
          mine: me ? { name: me.name, email: me.email, dates: me.dates } : null,
          sent: sent === "1" || sent === "2" ? sent : null,
          locale,
          t: { guest: t.guest, poll: t.poll },
        }} />
      ) : me ? (
        <p className="note"><Party />{format(t.guest.yourAnswerKept, { name: me.name })}</p>
      ) : null}

      <p className="hint guest-privacy">{t.guest.privacy}</p>
    </div>
  ) };
}
