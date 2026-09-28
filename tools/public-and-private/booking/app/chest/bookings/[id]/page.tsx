import { notFound } from "next/navigation";
import { Avatar } from "../../../../components/avatar.tsx";
import { Back, Calendar, Chat, Check, Clock, kindIcon, Mail, Person, Phone } from "../../../../components/icons.tsx";
import { AppError } from "../../../../lib/app-error.ts";
import * as b from "../../../../lib/booking.ts";
import { db } from "../../../../lib/db.ts";
import { format, meetingTime, plural, relative, zoneName } from "../../../../lib/i18n/index.ts";
import { nameOf, people } from "../../../../lib/people.ts";
import { answerText } from "../../../../lib/questions.ts";
import { viewer } from "../../../../lib/session.ts";
import { CancelMeeting } from "./cancel-meeting.tsx";

// One booking: who, when (in the host's zone, and the guest's when it
// differs), where, their note and answers; cancelling tells the guest.
export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t, locale } = v;
  const sql = db();
  let x: b.Booking;
  try {
    x = await b.bookingFor(sql, member, (await params).id);
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  const host = await b.hostOf(sql, x.memberId);
  const s = await b.settings(sql);
  const zone = host?.zone ?? s.defaultZone;
  const person = (await people([x.memberId])).get(x.memberId);
  const Kind = kindIcon[x.locationKind];
  const upcoming = x.status === "confirmed" && x.endsAt.getTime() > Date.now();
  const where = x.locationKind === "phone" ? x.guestPhone : x.location;
  return (
    <>
      <a className="back" href="/chest"><Back />{t.booking.back}</a>
      <div className="page-head">
        <div>
          <h1>{x.guestName}</h1>
          <p className="muted">{x.title} · {plural(t.minutes, x.duration, locale)}</p>
        </div>
        {x.status === "cancelled" && x.cancelledBy && <span className="tag danger">{t.booking.cancelledBy[x.cancelledBy]}</span>}
      </div>
      <section className="card">
        <dl className="facts">
          <dt><Calendar />{t.booking.when}</dt>
          <dd>
            <span className="big-time">{meetingTime(x.startsAt, zone, locale)}</span>
            {x.guestZone !== zone && <div className="hint">{format(t.booking.theirTime, { time: `${meetingTime(x.startsAt, x.guestZone, locale)} (${zoneName(x.guestZone)})` })}</div>}
          </dd>
          <dt><Kind />{t.booking.where}</dt>
          <dd>{t.kinds[x.locationKind]}{where ? " — " : ""}{x.locationKind === "video" && where ? <a href={where} target="_blank" rel="noopener noreferrer">{where}</a> : where}</dd>
          <dt><Person />{t.booking.host}</dt>
          <dd className="row"><Avatar name={nameOf(person, locale)} photo={person?.photo ?? null} size={24} />{person?.id === member.id ? t.people.you : nameOf(person, locale)}</dd>
          <dt><Mail />{t.booking.email}</dt>
          <dd><a href={`mailto:${x.guestEmail}`}>{x.guestEmail}</a></dd>
          {x.guestPhone && <><dt><Phone />{t.booking.phone}</dt><dd><a href={`tel:${x.guestPhone.replace(/[^\d+]/gu, "")}`}>{x.guestPhone}</a></dd></>}
          <dt><Clock />{t.booking.bookedLabel}</dt>
          <dd>{relative(x.createdAt, locale)}{x.moves > 0 && <> · {plural(t.booking.movedTimes, x.moves, locale)}</>}</dd>
        </dl>
        {x.guestNote && (
          <div className="stack-s" style={{ marginTop: "var(--space-5)" }}>
            <h2 className="row" style={{ fontSize: "var(--text-m)", fontFamily: "var(--font-body)", fontWeight: 650 }}><Chat />{t.booking.note}</h2>
            <p className="quote">{x.guestNote}</p>
          </div>
        )}
        {x.answers.length > 0 && (
          <div className="stack-s" style={{ marginTop: "var(--space-5)" }}>
            <h2 className="row" style={{ fontSize: "var(--text-m)", fontFamily: "var(--font-body)", fontWeight: 650 }}><Check />{t.booking.answers}</h2>
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
        {x.status === "cancelled" && x.cancelReason && <p className="quote" style={{ marginTop: "var(--space-4)" }}>{format(t.booking.reason, { reason: x.cancelReason })}</p>}
      </section>
      {upcoming && (
        <section className="card">
          <CancelMeeting id={x.id} guest={x.guestName} t={{ booking: t.booking, errors: t.errors }} />
        </section>
      )}
    </>
  );
}
