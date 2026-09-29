import * as chest from "@argentic/chest-sdk/chest";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check } from "../../../components/icons.tsx";
import { PublicShell } from "../../../components/public-shell.tsx";
import { brandOf, retentionWords } from "../../../lib/careers.ts";
import { db } from "../../../lib/db.ts";
import { format } from "../../../lib/i18n/index.ts";
import { meetingTime } from "../../../lib/i18n/format.ts";
import { settings } from "../../../lib/jobs.ts";
import { offer } from "../../../lib/self-schedule.ts";
import { publicWords } from "../../../lib/session.ts";
import { TimePicker } from "./time-picker.tsx";

// A link is someone's own: never indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

// The candidate chooses their interview time: the times when everyone who
// meets them is free (lib/self-schedule.ts), by day; one tap chooses, one
// button confirms. Once chosen, the page says when — the email carries
// the calendar file. The address is the only key: nothing of the
// candidate but their first name is on the page.
export default async function ChooseTime({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { t, locale } = await publicWords();
  const sql = db();
  const found = await offer(sql, token);
  if (!found) notFound();
  const s = await settings(sql);
  const company = s.companyName || t.careers.titlePlain;
  const zone = chest.timeZone();
  const w = t.pick;
  const foot = <><span>{format(t.careers.footer, { company })}</span><span>{format(t.careers.privacy, { period: retentionWords(t, s.retentionMonths) })}</span></>;
  const { request } = found;
  const intl = locale === "fr" ? "fr" : "en-GB";
  const dayLabel = (d: string) => new Intl.DateTimeFormat(intl, { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(d + "T12:00:00Z"));
  const zoneName = (zone.split("/").at(-1) ?? zone).replace(/_/gu, " ");
  return (
    <PublicShell company={company} locale={locale} label={t.careers.language} back={`/interview/${token}`} foot={foot} brand={brandOf(s)} website={t.careers.website}>
      {request.status === "booked" && found.interview ? (
        <section className="thanks" role="status">
          <span className="thanks-mark" aria-hidden="true"><Check /></span>
          <h1 className="display">{w.bookedTitle}</h1>
          <p className="lede">{format(w.bookedBody, { when: meetingTime(found.interview.start, zone, locale), job: found.job })}</p>
          {found.interview.place && <p>{format(w.where, { place: found.interview.place })}</p>}
          <p>{w.bookedNext}</p>
        </section>
      ) : request.status !== "open" ? (
        <section className="thanks">
          <h1 className="display">{request.status === "expired" ? w.expiredTitle : w.goneTitle}</h1>
          <p className="lede">{w.goneBody}</p>
        </section>
      ) : (
        <section className="pick stack">
          <p className="kicker">{found.job}</p>
          <h1 className="display">{format(w.title, { firstName: found.candidate.firstName })}</h1>
          <p className="lede">{format(w.lede, { minutes: request.minutes })}</p>
          {request.place && <p>{format(w.where, { place: request.place })}</p>}
          {request.note && <p className="pick-note">{request.note}</p>}
          {found.days.length === 0 ? (
            <p className="notice" role="status">{w.none}</p>
          ) : (
            <TimePicker token={token} days={found.days.map(d => ({ day: d.day, label: dayLabel(d.day), times: d.times }))} zoneNote={format(w.zone, { zone: zoneName })}
              t={{ legend: w.legend, confirm: w.confirm, confirming: w.confirming, choose: w.choose, more: w.moreDays, errors: t.errors }} />
          )}
        </section>
      )}
    </PublicShell>
  );
}
