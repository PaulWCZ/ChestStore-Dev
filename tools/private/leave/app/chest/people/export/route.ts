import { localeOf, member } from "@argentic/chest-sdk/member";
import { AppError } from "../../../../lib/app-error.ts";
import { toCsv } from "../../../../lib/csv.ts";
import { db } from "../../../../lib/db.ts";
import { catalogue, format } from "../../../../lib/i18n/index.ts";
import { payroll } from "../../../../lib/payroll.ts";
import { people, plainName } from "../../../../lib/people.ts";
import { types } from "../../../../lib/rules.ts";
import { typeName } from "../../../../lib/type-name.ts";

// The payroll export of a month, as a CSV for a spreadsheet or the payroll
// provider: HR only, in the reader's language, names resolved now; each
// absence with its kind's payroll code (CP, RTT, MAL…), which payroll
// software imports by.
export async function GET(request: Request): Promise<Response> {
  const actor = member(request);
  if (!actor) return new Response(null, { status: 401 });
  const month = new URL(request.url).searchParams.get("month") ?? "";
  const locale = localeOf(actor.language);
  const t = catalogue(locale);
  try {
    const rows = await payroll(db(), actor, month);
    const [all, who] = await Promise.all([types(db(), { archived: true }), people(rows.map(r => r.memberId))]);
    const typeOf = new Map(all.map(ty => [ty.id, ty]));
    const numberOf = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false }).format(n);
    const lines = rows
      .map(r => ({ ...r, name: r.memberId === "erased" ? t.people.erased : plainName(who.get(r.memberId), locale) }))
      .sort((a, b) => a.name.localeCompare(b.name, locale) || a.start.localeCompare(b.start));
    const csv = toCsv([
      [t.export.number, t.export.person, t.export.type, t.export.code, t.export.firstDay, t.export.firstHalf, t.export.lastDay, t.export.lastHalf, t.export.daysInMonth, t.export.days],
      ...lines.map(r => [r.employeeNumber ?? "", r.name, typeName(typeOf.get(r.typeId), t.types), typeOf.get(r.typeId)?.payrollCode ?? "", r.start, r.startHalf === "am" ? t.export.morning : t.export.noon, r.end, r.endHalf === "am" ? t.export.noon : t.export.evening, numberOf(r.daysInMonth), numberOf(r.days)]),
    ], t.export.separator === ";" ? ";" : ",");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${format(t.export.file, { month })}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return new Response(t.errors[error.code], { status: error.code === "forbidden" ? 403 : 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    throw error;
  }
}
