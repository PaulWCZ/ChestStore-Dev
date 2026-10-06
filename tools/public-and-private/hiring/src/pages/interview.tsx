import { chest } from "@argentic/chest-sdk/chest";
import { Honeypot, Island, notFound, type PageContext, type View, type VisitorContext } from "@argentic/chest-app";
import { Check } from "../components/icons.tsx";
import { catalogue, isLocale, type Locale } from "../i18n/index.ts";
import { db } from "../lib/db.ts";
import { mailStateKept } from "../lib/mail-state.ts";
import { offer } from "../lib/self-schedule.ts";
import { dayLabel, format, meetingTime, zoneName } from "../shared/format.ts";
import { careersOf, Frame } from "./careers.tsx";

// The candidate chooses their interview time: the times when everyone who
// meets them is free (src/lib/self-schedule.ts), by day; one tap chooses,
// one button confirms. Once chosen, the page says when — the email carries
// the calendar file. The address is the only key (never indexed, never
// kept by a cache, no referrer): nothing of the candidate but their first
// name is on the page. It speaks the language they applied in (?lang=, as
// their emails), unless they chose another with the switch. Times are the
// Chest's (the page says which zone): a candidate's own is unknown.
export async function interviewPage(ctx: PageContext<VisitorContext>): Promise<View> {
  const token = ctx.param("token");
  const found = await offer(db(), token);
  if (!found) notFound();
  const linked = ctx.query("lang");
  const locale: Locale = !isLocale(ctx.cookies.get("lang")) && isLocale(linked) ? linked : (ctx.locale as Locale);
  const t = catalogue(locale);
  const c = await careersOf({ ...ctx, locale, t });
  const zone = chest.timeZone;
  const w = t.pick;
  const { request } = found!;
  // Once booked, the confirmation is promised only when mail will go.
  const mailing = request.status === "booked" ? await mailStateKept() : "unknown";
  // Until it starts, the candidate may give the time back: to choose
  // another (while the link's days last) or to call it off (asked once
  // more: ?off=1). Plain forms: no JavaScript needed.
  const booked = request.status === "booked" ? found!.interview : null;
  const when = booked ? meetingTime(booked.start, zone, locale) : "";
  const changeable = booked !== null && !booked.cancelled && new Date(booked.start).getTime() > Date.now();
  const reopenable = changeable && chest.today() <= request.lastDay;
  const asking = changeable && ctx.query("off") === "1";
  return {
    title: w.legend,
    locale,
    head: <meta name="robots" content="noindex, nofollow" />,
    body: (
      <Frame c={c} back={`/interview/${token}`}>
        {request.status === "booked" && found!.interview && !found!.interview.cancelled ? (
          asking ? (
            <section className="thanks stack">
              <h1 className="display">{format(w.callOffAsk, { when })}</h1>
              <p className="lede">{w.callOffBody}</p>
              <div className="form-actions">
                <form method="post" action="/actions/releaseTime">
                  <Honeypot />
                  <input type="hidden" name="token" value={token} />
                  <input type="hidden" name="what" value="off" />
                  <button type="submit" className="button danger">{w.callOffYes}</button>
                </form>
                <a className="button quiet" href={`/interview/${token}`}>{w.keep}</a>
              </div>
            </section>
          ) : (
            <section className="thanks" role="status">
              <span className="thanks-mark" aria-hidden="true"><Check /></span>
              <h1 className="display">{w.bookedTitle}</h1>
              <p className="lede">{format(w.bookedBody, { when, job: found!.job })}</p>
              {found!.interview.place && <p>{format(w.where, { place: found!.interview.place })}</p>}
              <p>{mailing === "off" ? w.bookedNoMail : mailing === "later" ? w.bookedLater : w.bookedNext}</p>
              {changeable && (
                <div className="change-time stack">
                  <h2>{w.changeTitle}</h2>
                  <div className="form-actions">
                    {reopenable && (
                      <form method="post" action="/actions/releaseTime">
                        <Honeypot />
                        <input type="hidden" name="token" value={token} />
                        <input type="hidden" name="what" value="another" />
                        <button type="submit" className="button quiet">{w.another}</button>
                      </form>
                    )}
                    <a className="button quiet" href={`/interview/${token}?off=1`}>{w.callOff}</a>
                  </div>
                </div>
              )}
            </section>
          )
        ) : request.status === "cancelled" && request.interviewId && found!.interview?.cancelled ? (
          <section className="thanks" role="status">
            <h1 className="display">{w.declinedTitle}</h1>
            <p className="lede">{w.declinedBody}</p>
          </section>
        ) : request.status !== "open" ? (
          <section className="thanks">
            <h1 className="display">{request.status === "expired" ? w.expiredTitle : w.goneTitle}</h1>
            <p className="lede">{w.goneBody}</p>
          </section>
        ) : (
          <section className="pick stack">
            <p className="kicker">{found!.job}</p>
            <h1 className="display">{format(w.title, { firstName: found!.candidate.firstName })}</h1>
            <p className="lede">{format(w.lede, { minutes: request.minutes })}</p>
            {request.place && <p>{format(w.where, { place: request.place })}</p>}
            {request.note && <p className="pick-note">{request.note}</p>}
            {found!.days.length === 0 ? (
              <p className="notice" role="status">{w.none}</p>
            ) : (
              <Island id={`pick-${request.id}`} name="TimePicker" props={{
                token, days: found!.days.map(d => ({ day: d.day, label: dayLabel(d.day, locale), times: d.times })), zoneNote: format(w.zone, { zone: zoneName(zone) }),
                t: { legend: w.legend, confirm: w.confirm, confirming: w.confirming, choose: w.choose, more: w.moreDays, gone: t.errors.gone },
              }} />
            )}
          </section>
        )}
      </Frame>
    ),
  };
}
