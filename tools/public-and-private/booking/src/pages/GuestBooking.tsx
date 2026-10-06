import { Avatar } from "@argentic/chest-ui/components";
import { CalendarCheck, CalendarOff, Check, Clock, Download, kindIcon, Person } from "../components/icons.tsx";
import type { PageContext, View } from "../core/http.tsx";
import { Island } from "../core/island.tsx";
import type { VisitorContext } from "../core/tool.ts";
import { format, meetingTime, plural, startsWithVowel, zoneName } from "../i18n/index.ts";
import { bySecret, firstFree, isPublicJitsi, meetingPlace, settings, typeForMove } from "../lib/booking.ts";
import { db } from "../lib/db.ts";
import { nameOf, people } from "../lib/people.ts";
import { publicOrigin } from "../lib/public-origin.ts";
import { zoneGroups } from "../lib/zones.ts";
import { sheetOf } from "../theme.ts";
import { PublicShell } from "./PublicShell.tsx";

// The guest's booking page (/b/<secret>): the booking, add it to a
// calendar, move it, cancel it. The secret is the only key.
export async function guestBookingPage({ t, locale, request, param, query }: PageContext<VisitorContext>): Promise<View> {
  const secret = param("secret");
  const sql = db();
  const [found, s, sheet] = await Promise.all([bySecret(sql, secret), settings(sql), sheetOf("public")]);
  const self = `/b/${secret}`;
  if (!found) {
    return {
      title: t.public.notFoundTitle,
      body: (
        <PublicShell look={sheet.look} company={s.companyName} locale={locale} label={t.public.language} back="/">
          <div className="confirmation">
            <div className="stamp off"><CalendarOff /></div>
            <h1>{t.public.notFoundTitle}</h1>
            <p className="lead">{t.public.notFoundBody}</p>
          </div>
        </PublicShell>
      ),
    };
  }
  const { booking: b } = found;
  const person = (await people([b.memberId])).get(b.memberId);
  const hostName = person?.status === "member" ? person.name : nameOf(person, locale);
  const shortName = person?.status === "member" ? person.firstName || person.name : hostName;
  const Kind = kindIcon[b.locationKind];
  const now = Date.now();
  const past = b.endsAt.getTime() <= now;
  const live = b.status === "confirmed" && b.startsAt.getTime() > now;
  const moving = live && query("move") === "1";
  const place = moving && found.hostSlug && found.typeSlug ? await typeForMove(sql, found.booking) : null;
  const again = found.hostSlug ? `/${found.hostSlug}` : "/";
  const room = meetingPlace(b);
  const where = b.locationKind === "phone" ? format(t.public.phoneCall, { name: shortName, phone: b.guestPhone }) : room || (b.locationKind === "video" ? format(t.public.whereLater, { name: shortName }) : "");
  // Without email, the calendar file is the guest's only reminder: first.
  const fresh = query("new") === "1";
  const mailed = query("mailed") === "1";
  const noMail = fresh && !mailed;
  const title = b.status === "cancelled" ? t.public.cancelledTitle : past ? t.public.pastTitle : t.public.confirmedTitle;
  const lead = b.status === "cancelled" ? (b.cancelledBy === "host" ? format(t.public.cancelledByHost, { name: shortName }) : t.public.cancelledByGuest) : query("moved") === "1" ? t.public.movedToast : fresh ? (mailed ? format(t.public.confirmedBody, { email: b.guestEmail }) : t.public.confirmedNoMail) : "";
  return {
    title,
    body: (
      <PublicShell look={sheet.look} company={s.companyName} locale={locale} label={t.public.language} back={self}>
        <div className="confirmation">
          <div className={`stamp${b.status === "cancelled" ? " off" : ""}`}>{b.status === "cancelled" ? <CalendarOff /> : <CalendarCheck />}</div>
          <h1>{title}</h1>
          {lead ? <p className="lead" role="status">{lead}</p> : <div className="lead-space" />}
          <section className="card">
            <dl className="facts">
              <dt><CalendarCheck />{t.public.when}</dt>
              <dd><span className="big-time">{meetingTime(b.startsAt, b.guestZone, locale)}</span><div className="hint">{plural(t.minutes, b.duration, locale)} · {zoneName(b.guestZone, t.zones.cities)}</div></dd>
              <dt><Person />{b.title}</dt>
              <dd className="row"><Avatar name={hostName} photo={null} size="s" />{format(t.public.with, { name: hostName })}</dd>
              <dt><Kind />{t.public.where}</dt>
              <dd>{t.kinds[b.locationKind]}{where && <><br />{b.locationKind === "video" && room ? <a href={room} target="_blank" rel="noopener noreferrer">{room}</a> : where}</>}
                {live && b.locationKind === "video" && isPublicJitsi(room) && <div className="hint">{format(startsWithVowel(shortName) ? t.public.jitsiGuestVowel : t.public.jitsiGuest, { name: shortName })}</div>}</dd>
            </dl>
            {live && b.paymentLink && (
              <div className="pay">
                {b.paid ? <span className="tag free"><Check />{t.public.paid}</span> : <><a className="button" href={b.paymentLink} target="_blank" rel="noopener noreferrer">{t.public.pay}</a><span className="hint">{format(t.public.payHint, { name: shortName })}</span></>}
              </div>
            )}
            {live && (
              <div className="row spaced-top">
                <a className={noMail ? "button" : "button soft"} href={`${self}/ics`} download><Download />{t.public.addCalendar}</a>
                <Island name="CopyButton" props={{ text: `${publicOrigin(request.headers) ?? ""}${self}`, label: t.public.copy, done: t.public.copied }} />
              </div>
            )}
          </section>
          {live && !moving && (
            <section className="card stack">
              <div className="row">
                {found.hostSlug && found.typeSlug ? <a className="button quiet" href={`${self}?move=1`}><Clock />{t.public.move}</a> : <p className="hint">{t.public.unavailableHost}</p>}
              </div>
              <Island name="CancelMine" props={{ secret, hostName: shortName, t: { public: t.public } }} />
            </section>
          )}
          {moving && (
            <section className="card stack">
              <h2>{t.public.moveTitle}</h2>
              {place ? <Island name="MoveMine" props={{ secret, guestZone: b.guestZone, hostSlug: place.host.slug, typeSlug: place.type.slug, hostName: shortName, hostZone: place.host.zone, first: await firstFree(sql, place.host, place.type), locale, zones: zoneGroups(t.zones, Date.now(), [b.guestZone]), t: { public: t.public, days: t.days, errors: t.errors, answers: t.answers } }} /> : <p className="hint">{t.public.unavailableHost}</p>}
              <div><a className="link-button" href={self}>{t.public.keep}</a></div>
            </section>
          )}
          {!live && <p className="again"><a className="button" href={again}>{t.public.bookAgain}</a></p>}
        </div>
      </PublicShell>
    ),
  };
}
