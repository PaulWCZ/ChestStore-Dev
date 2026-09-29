import { member } from "@argentic/chest-sdk/member";
import { can } from "../../../../lib/access.ts";
import { AppError } from "../../../../lib/app-error.ts";
import { today, zone } from "../../../../lib/clock.ts";
import { toCsv } from "../../../../lib/csv.ts";
import { db } from "../../../../lib/db.ts";
import { hours } from "../../../../lib/duration.ts";
import { catalogue, clock, format, intl, isLocale } from "../../../../lib/i18n/index.ts";
import { nameFor, people } from "../../../../lib/people.ts";
import { period } from "../../../../lib/periods.ts";
import { exportRows } from "../../../../lib/reports.ts";

// The report's entries as a CSV, for a spreadsheet, the invoicing or the
// payroll: in the reader's language (French: ";" and decimal commas), names
// resolved now. A member gets their own time; rates, amounts, costs and
// what was invoiced are for managers (each at the rate in force on the
// entry's day).
export async function GET(request: Request): Promise<Response> {
  const actor = member(request);
  if (!actor) return new Response(null, { status: 401 });
  const locale = isLocale(actor.locale) ? actor.locale : "en";
  const t = catalogue(locale);
  const q = new URL(request.url).searchParams;
  const p = period(q.get("preset"), today(), q.get("from"), q.get("to"));
  try {
    const rows = await exportRows(db(), actor, { from: p.from, to: p.to, group: q.get("group"), person: q.get("person") || undefined, billable: q.get("kind"), q: q.get("q") });
    const who = await people(rows.map(r => r.memberId));
    const z = zone();
    const money = can(actor, "reports.all");
    const number = (n: number) => new Intl.NumberFormat(intl(locale), { maximumFractionDigits: 2, useGrouping: false }).format(n);
    const e = t.export;
    const csv = toCsv([
      [e.date, e.person, e.client, e.project, e.task, e.note, e.hours, e.billable, ...(money ? [e.rate, e.amount, e.costRate, e.cost, e.invoiced] : []), e.start, e.end],
      ...rows.map(r => [
        r.day, nameFor(r.memberId, who, locale), r.clientName ?? "", r.projectName, r.taskName ?? "", r.note, number(hours(r.minutes)), r.billable ? e.yes : e.no,
        ...(money ? [
          r.rateCents === null ? "" : number(r.rateCents / 100), r.cents ? number(r.cents / 100) : "",
          r.costRateCents === null ? "" : number(r.costRateCents / 100), r.costCents ? number(r.costCents / 100) : "", r.invoiced ? e.yes : e.no,
        ] : []),
        r.startedAt ? clock(r.startedAt, z, locale) : "", r.endedAt ? clock(r.endedAt, z, locale) : "",
      ]),
    ], e.separator === ";" ? ";" : ",");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${format(e.file, { from: p.from, to: p.to })}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return new Response(format(t.errors[error.code], error.values as Record<string, string | number>), { status: error.code === "forbidden" ? 403 : 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    throw error;
  }
}
