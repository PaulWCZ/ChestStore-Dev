import { chest } from "@argentic/chest-sdk/chest";
import { Island, notFound, type PageContext, type View, type VisitorContext } from "@argentic/chest-app";
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
  return {
    title: w.legend,
    locale,
    head: <meta name="robots" content="noindex, nofollow" />,
    body: (
      <Frame c={c} back={`/interview/${token}`}>
        {request.status === "booked" && found!.interview ? (
          <section className="thanks" role="status">
            <span className="thanks-mark" aria-hidden="true"><Check /></span>
            <h1 className="display">{w.bookedTitle}</h1>
            <p className="lede">{format(w.bookedBody, { when: meetingTime(found!.interview.start, zone, locale), job: found!.job })}</p>
            {found!.interview.place && <p>{format(w.where, { place: found!.interview.place })}</p>}
            <p>{mailing === "off" ? w.bookedNoMail : mailing === "later" ? w.bookedLater : w.bookedNext}</p>
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
                t: { legend: w.legend, confirm: w.confirm, confirming: w.confirming, choose: w.choose, more: w.moreDays },
              }} />
            )}
          </section>
        )}
      </Frame>
    ),
  };
}
