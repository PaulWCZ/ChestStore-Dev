import type { Member } from "@argentic/chest-sdk/member";
import type { Context } from "hono";
import { stream } from "hono/streaming";
import { catalogue, clock, decimal, format, localeOf } from "./i18n/index.ts";
import { can } from "./lib/access.ts";
import { AppError } from "./lib/app-error.ts";
import { today, zone } from "./lib/clock.ts";
import { db } from "./lib/db.ts";
import { nameFor, people } from "./lib/people.ts";
import { exportAuthors, exportBatches, scope } from "./lib/reports.ts";
import { toCsvLines } from "./shared/csv.ts";
import { hours } from "./shared/duration.ts";
import { period } from "./shared/periods.ts";

// The report's entries as a CSV (/chest/reports/export, the report's own
// parameters), for a spreadsheet, the invoicing or the payroll: in the
// reader's language (French: ";" and decimal commas), names resolved once
// before the rows, formulas defused. A member gets their own time; rates,
// amounts, costs and what was invoiced are for managers (each at the rate
// in force on the entry's day). Written as the rows are read (a cursor):
// a year of a large team never sits whole in memory.
export async function reportFile(c: Context, actor: Member): Promise<Response> {
  const locale = localeOf(actor.language);
  const t = catalogue(locale);
  const q = new URL(c.req.url).searchParams;
  const p = period(q.get("preset"), today(), q.get("from"), q.get("to"));
  const query = { from: p.from, to: p.to, group: q.get("group"), person: q.get("person") || undefined, billable: q.get("kind"), q: q.get("q") };
  const sql = db();
  let who: Awaited<ReturnType<typeof people>>;
  try {
    scope(actor, query);
    who = await people(await exportAuthors(sql, actor, query));
  } catch (error) {
    if (error instanceof AppError) return c.text(format(t.errors[error.code], error.values), error.code === "forbidden" ? 403 : 400);
    throw error;
  }
  const z = zone();
  const money = can(actor, "reports.all");
  const number = (n: number) => decimal(n, locale, 2, { grouping: false });
  const e = t.export;
  const separator = e.separator === ";" ? ";" : ",";
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="${format(e.file, { from: p.from, to: p.to })}"`);
  c.header("Cache-Control", "private, no-store");
  return stream(c, async out => {
    await out.write(toCsvLines([[e.date, e.person, e.client, e.project, e.task, e.note, e.hours, e.billable, ...(money ? [e.rate, e.amount, e.costRate, e.cost, e.invoiced] : []), e.start, e.end]], separator, { bom: true }));
    for await (const rows of exportBatches(sql, actor, query)) {
      await out.write(toCsvLines(rows.map(r => [
        r.day, nameFor(r.memberId, who, locale), r.clientName ?? "", r.projectName, r.taskName ?? "", r.note, number(hours(r.minutes)), r.billable ? e.yes : e.no,
        ...(money ? [
          r.rateCents === null ? "" : number(r.rateCents / 100), r.cents ? number(r.cents / 100) : "",
          r.costRateCents === null ? "" : number(r.costRateCents / 100), r.costCents ? number(r.costCents / 100) : "", r.invoiced ? e.yes : e.no,
        ] : []),
        r.startedAt ? clock(r.startedAt, z, locale) : "", r.endedAt ? clock(r.endedAt, z, locale) : "",
      ]), separator));
    }
  });
}
