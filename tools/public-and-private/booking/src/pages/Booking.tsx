import { Avatar, PageHeader, StatusBadge } from "@argentic/chest-ui/components";
import { Back, Calendar, Chat, Check, Clock, kindIcon, Link, Mail, Person, Phone } from "../components/icons.tsx";
import type { PageContext, View } from "@argentic/chest-app";
import { Island } from "@argentic/chest-app";
import { AppError, notFound, type MemberContext } from "@argentic/chest-app";
import { format, isLocale, meetingTime, plural, relative, zoneName, localeOf } from "../i18n/index.ts";
import * as b from "../lib/booking.ts";
import { db } from "../lib/db.ts";
import { nameOf, people } from "../lib/people.ts";
import { answerText } from "../lib/questions.ts";
import { zoneGroups } from "../lib/zones.ts";

const upcomingOf = (x: b.Booking) => x.status === "confirmed" && x.endsAt.getTime() > Date.now();

// One booking (/chest/bookings/<id>): who, when (in the host's zone, and the
// guest's when it differs), where, their note and answers; moving it and
// cancelling it tell the guest.
export async function bookingPage({ member, t, locale: given, param }: PageContext<MemberContext>): Promise<View> {
  const locale = localeOf(given);
  const sql = db();
  let x: b.Booking;
  try {
    x = await b.bookingFor(sql, member, param("id"));
  } catch (error) {
    if (error instanceof AppError) return notFound();
    throw error;
  }
  const host = await b.hostOf(sql, x.memberId);
  const s = await b.settings(sql);
  const zone = host?.zone ?? s.defaultZone;
  const who = await people([x.memberId, ...(x.bookedBy ? [x.bookedBy] : [])]);
  const person = who.get(x.memberId);
  const movable = upcomingOf(x) && (await b.typeForMove(sql, x)) !== null;
  const Kind = kindIcon[x.locationKind];
  const upcoming = upcomingOf(x);
  const words = { booking: t.booking, public: t.public, days: t.days, errors: t.errors, answers: t.answers };
  const where = x.locationKind === "phone" ? x.guestPhone : b.meetingPlace(x);
  // The type in the reader's language; the guest's own language said when
  // it is another (their emails are in it).
  const typeName = (x.typeId && (await b.typeNames(sql, [x.typeId], locale)).get(x.typeId)) || x.title;
  const theirs = isLocale(x.guestLanguage) && x.guestLanguage !== locale ? format(t.bookings.guestLanguage, { language: t.languages[x.guestLanguage] }) : "";
  return {
    title: x.guestName,
    body: (
      <>
        <a className="back" href="/chest"><Back />{t.booking.back}</a>
        <PageHeader size="m" title={x.guestName} intro={[typeName, plural(t.minutes, x.duration, locale), theirs].filter(Boolean).join(" · ")} secondary={x.status === "cancelled" && x.cancelledBy ? <StatusBadge tone="danger" label={t.booking.cancelledBy[x.cancelledBy]} /> : null} />
        <section className="card">
          <dl className="facts">
            <dt><Calendar />{t.booking.when}</dt>
            <dd>
              <span className="big-time">{meetingTime(x.startsAt, zone, locale)}</span>
              {x.guestZone !== zone && <div className="hint">{format(t.booking.theirTime, { time: `${meetingTime(x.startsAt, x.guestZone, locale)} (${zoneName(x.guestZone, t.zones.cities)})` })}</div>}
            </dd>
            <dt><Kind />{t.booking.where}</dt>
            <dd>{t.kinds[x.locationKind]}{where ? " — " : ""}{x.locationKind === "video" && where ? <a href={where} target="_blank" rel="noopener noreferrer">{where}</a> : where}
              {upcoming && x.locationKind === "video" && b.isPublicJitsi(where) && <div className="hint">{t.booking.jitsiHost}</div>}</dd>
            <dt><Person />{t.booking.host}</dt>
            <dd className="row"><Avatar name={nameOf(person, locale)} photo={person?.photo ?? null} size="s" />{person?.id === member.id ? t.people.you : nameOf(person, locale)}</dd>
            <dt><Mail />{t.booking.email}</dt>
            <dd><a href={`mailto:${x.guestEmail}`}>{x.guestEmail}</a></dd>
            {x.guestPhone && <><dt><Phone />{t.booking.phone}</dt><dd><a href={`tel:${x.guestPhone.replace(/[^\d+]/gu, "")}`}>{x.guestPhone}</a></dd></>}
            <dt><Clock />{t.booking.bookedLabel}</dt>
            <dd>
              {relative(x.createdAt, locale)}{x.moves > 0 && <> · {plural(t.booking.movedTimes, x.moves, locale)}</>}
              {x.source === "host" && x.bookedBy && <> · {format(t.booking.bookedBy, { name: x.bookedBy === member.id ? t.people.you : nameOf(who.get(x.bookedBy), locale) })}</>}
              {x.source === "import" && <> · {t.booking.imported}</>}
            </dd>
            {x.paymentLink && <><dt><Link />{t.booking.payment}</dt><dd><Island name="PaidSwitch" props={{ id: x.id, paid: x.paid, t: { booking: t.booking } }} /></dd></>}
          </dl>
          {x.guestNote && (
            <div className="stack-s spaced-top">
              <h2 className="row sub"><Chat />{t.booking.note}</h2>
              <p className="quote">{x.guestNote}</p>
            </div>
          )}
          {x.answers.length > 0 && (
            <div className="stack-s spaced-top">
              <h2 className="row sub"><Check />{t.booking.answers}</h2>
              <dl className="answers">
                {x.answers.map(a => (
                  <div key={a.id}>
                    <dt>{a.label}</dt>
                    <dd>{answerText(a, t.answers)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {x.status === "cancelled" && x.cancelReason && <p className="quote spaced-top-s">{format(t.booking.reason, { reason: x.cancelReason })}</p>}
        </section>
        {upcoming && (
          <section className="card">
            {movable ? <Island name="MoveMeeting" props={{ id: x.id, guest: x.guestName, zone, locale, zones: zoneGroups(t.zones, Date.now(), [zone]), t: words }} /> : <p className="hint">{t.booking.cannotMove}</p>}
          </section>
        )}
        {upcoming && (
          <section className="card">
            <Island name="CancelMeeting" props={{ id: x.id, guest: x.guestName, t: { booking: t.booking } }} />
          </section>
        )}
      </>
    ),
  };
}
