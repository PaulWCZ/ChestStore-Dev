import { chest } from "@argentic/chest-sdk/chest";
import { BrandMark, LanguageSwitch } from "@argentic/chest-ui/components";
import { storeLanguages } from "@argentic/chest-ui/components/logic";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { CalendarPlus, Clock, Info, Party } from "../../../components/icons.tsx";
import { Mark } from "../../../components/mark.tsx";
import { guestMailOffered } from "../../../lib/agenda.ts";
import { AppError } from "../../../lib/app-error.ts";
import { dates, optionText } from "../../../lib/dates.ts";
import { db } from "../../../lib/db.ts";
import { formToken } from "../../../lib/guard.ts";
import { byLink, mine } from "../../../lib/guests.ts";
import { format, locales } from "../../../lib/i18n/index.ts";
import { publicLook } from "../../../lib/theme.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { placesTaken, type Poll } from "../../../lib/polls.ts";
import { publicWords } from "../../../lib/session.ts";
import { chestZone } from "../../../lib/zone.ts";
import { guestCookie } from "./cookie.ts";
import { GuestForm } from "./guest-form.tsx";

// A date poll's page for guests (lib/guests.ts): on the public host,
// without an account. It shows the poll's words, the dates and the
// guest's own answer — never the other answers nor the team's names (only
// the organiser's, who shared the link). Its language is the visitor's
// (the switch, then the browser's); its look the company's brand or Polls'
// own, never a theme chosen for the team.
export default async function GuestPage({ params, searchParams }: { params: Promise<{ link: string }>; searchParams: Promise<{ sent?: string }> }) {
  const [{ link }, { sent }, { t, locale }, look] = await Promise.all([params, searchParams, publicWords(), publicLook()]);
  const sql = db();
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
  const secret = (await cookies()).get(guestCookie(poll.id))?.value;
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

  return (
    <main className="page public guest">
      <div className="guest-top">
        {/* A company's logo already says its name: the name only beside Polls' mark. */}
        <div className="brand"><BrandMark logo={look.logo}><Mark /></BrandMark>{look.logo ? null : company || t.meta.name}</div>
        <LanguageSwitch languages={storeLanguages.filter(l => (locales as readonly string[]).includes(l.code))} current={locale} label={t.public.language} back={back} />
      </div>
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
        <GuestForm
          link={link}
          pollId={poll.id}
          token={formToken()}
          options={options}
          signup={poll.slots !== null}
          mailOn={mailOn}
          mine={me ? { name: me.name, email: me.email, dates: me.dates } : null}
          sent={sent === "1" || sent === "2" ? sent : null}
          locale={locale}
          t={{ guest: t.guest, poll: t.poll, errors: t.errors }}
        />
      ) : me ? (
        <p className="note"><Party />{format(t.guest.yourAnswerKept, { name: me.name })}</p>
      ) : null}

      <p className="hint guest-privacy">{t.guest.privacy}</p>
    </main>
  );
}
