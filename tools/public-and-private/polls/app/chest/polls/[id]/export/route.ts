import { toCsv } from "../../../../../lib/csv.ts";
import { dates } from "../../../../../lib/dates.ts";
import { db } from "../../../../../lib/db.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { localeOf } from "@argentic/chest-sdk/member";
import { catalogue, format } from "../../../../../lib/i18n/index.ts";
import { nameOf, people } from "../../../../../lib/people.ts";
import { exportData } from "../../../../../lib/polls.ts";
import { currentMember } from "../../../../../lib/session.ts";
import { chestZone } from "../../../../../lib/zone.ts";

// The answers as a spreadsheet, in the reader's language, for those who
// manage the poll. A named poll: one row per person, one column per
// question (a date poll: per date). An anonymous poll: the counts and the
// free texts only — there is nothing else.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const actor = await currentMember();
    const data = await exportData(db(), actor, id);
    const locale = actor ? localeOf(actor.language) : "en";
    const t = catalogue(locale);
    const d = dates(locale, chestZone());
    const when = (o: { day: string | null; start: string | null; end: string | null }) => (o.day ? d.dayShort(o.day) + (o.start ? " " + d.hours(o as { day: string; start: string | null; end: string | null }, t.dates.range) : "") : "");
    const word = (v: number | null | undefined) => (v === 2 ? t.csv.yes : v === 1 ? t.csv.maybe : t.csv.no);
    const heading = (q: { text: string }) => q.text || data.poll.title;
    let rows: unknown[][];
    if (data.poll.anonymous) {
      rows = [[t.csv.question, t.csv.answer, t.csv.count, t.csv.percent]];
      for (const r of data.results) {
        if (r.kind === "choice") {
          for (const o of r.options) rows.push([heading(r), o.label, o.count, o.percent]);
          if (r.other) {
            rows.push([heading(r), t.csv.other, r.other.count, r.other.percent]);
            for (const x of r.other.texts) rows.push([heading(r), x.body, "", ""]);
          }
        } else if (r.kind === "date") {
          const q = data.poll.questions.find(x => x.id === r.id)!;
          for (const o of r.options) {
            const label = when(q.options.find(x => x.id === o.id)!);
            rows.push([heading(r), `${label} · ${t.csv.yes}`, o.yes, ""], [heading(r), `${label} · ${t.csv.maybe}`, o.maybe, ""], [heading(r), `${label} · ${t.csv.no}`, o.no, ""]);
          }
        } else if (r.kind === "scale") {
          for (const c of r.counts) rows.push([heading(r), c.value, c.count, c.percent]);
          rows.push([heading(r), t.csv.average, r.average ?? "", ""]);
        } else if (r.kind === "enps") {
          for (const [value, count] of r.counts.entries()) rows.push([heading(r), value, count, r.answered > 0 ? Math.round((count * 100) / r.answered) : 0]);
          rows.push([heading(r), t.csv.enps, r.score ?? "", ""]);
        } else for (const x of r.texts) rows.push([heading(r), x.body, "", ""]);
      }
    } else {
      const columns: { title: string; cell: (answers: typeof data.rows) => unknown }[] = [];
      for (const q of data.poll.questions) {
        if (q.kind === "date") {
          for (const o of q.options) columns.push({ title: when(o), cell: a => word(a.find(x => x.question === q.id && x.option === o.id)?.value) });
        } else if (q.kind === "choice") {
          columns.push({ title: heading(q), cell: a => a.filter(x => x.question === q.id).map(x => (x.option ? q.options.find(o => o.id === x.option)?.label ?? "" : `${t.csv.other}: ${x.text ?? ""}`)).join(" ; ") });
        } else if (q.kind === "scale" || q.kind === "enps") columns.push({ title: heading(q), cell: a => a.find(x => x.question === q.id)?.value ?? "" });
        else columns.push({ title: heading(q), cell: a => a.find(x => x.question === q.id)?.text ?? "" });
      }
      const byParticipant = new Map<string, typeof data.rows>();
      for (const r of data.rows) byParticipant.set(r.participant, [...(byParticipant.get(r.participant) ?? []), r]);
      const who = await people(data.rows.map(r => r.member));
      // Guests (lib/guests.ts) are marked, with the email they gave.
      const withGuests = data.guests.size > 0;
      rows = [[t.csv.person, ...(withGuests ? [t.csv.guestEmail] : []), ...columns.map(c => c.title)]];
      for (const answers of byParticipant.values()) {
        const guest = data.guests.get(answers[0]!.member);
        const name = guest ? format(t.csv.guest, { name: guest.name }) : nameOf(who.get(answers[0]!.member), locale);
        rows.push([name, ...(withGuests ? [guest?.email ?? ""] : []), ...columns.map(c => c.cell(answers))]);
      }
    }
    return new Response(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${t.csv.file}-${data.poll.id}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: error.code === "forbidden" ? 403 : 404 });
    throw error;
  }
}
