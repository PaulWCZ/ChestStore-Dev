import { member } from "@argentic/chest-sdk/member";
import { can } from "../../../../lib/access.ts";
import { AppError } from "../../../../lib/app-error.ts";
import { balancesOf } from "../../../../lib/balances.ts";
import { toCsv } from "../../../../lib/csv.ts";
import { db } from "../../../../lib/db.ts";
import { everyoneOrNone } from "../../../../lib/directory.ts";
import { catalogue, format, isLocale } from "../../../../lib/i18n/index.ts";
import { isDay } from "../../../../lib/calendar.ts";
import { today } from "../../../../lib/model.ts";
import { nameOf, people } from "../../../../lib/people.ts";
import { types } from "../../../../lib/rules.ts";
import { allStaff, formerIds } from "../../../../lib/staff.ts";
import { typeName } from "../../../../lib/type-name.ts";

// Everyone's balances on a day, as the pay slip shows them: for paid leave
// the days acquired (CP N-1: earned, taken, left) and being earned (CP N),
// days carried over, leave approved for later, what is left; for other
// kinds what is left. Everyone the tool knows, those who left included
// (their last day: the balance payroll pays when the contract ends). HR
// only, in the reader's language, with the employee number payroll imports
// by.
export async function GET(request: Request): Promise<Response> {
  const actor = member(request);
  if (!actor) return new Response(null, { status: 401 });
  const locale = isLocale(actor.locale) ? actor.locale : "en";
  const t = catalogue(locale);
  const text = (code: "forbidden" | "invalid", status: number) => new Response(t.errors[code], { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  try {
    if (!can(actor, "export")) throw new AppError("forbidden");
    const on = new URL(request.url).searchParams.get("on") || today();
    if (!isDay(on) || on > today()) throw new AppError("invalid");
    const sql = db();
    const [dir, staff, all, gone] = await Promise.all([everyoneOrNone(), allStaff(sql), types(sql), formerIds(sql)]);
    const ids = [...new Set([...dir.people.map(p => p.id), ...gone])];
    const [bal, who] = await Promise.all([balancesOf(sql, ids, on, { takenBy: true }), people(ids)]);
    const counted = all.filter(ty => ty.balance);
    const n = (x: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false }).format(x);
    const header: string[] = [t.export.number, t.export.person, t.export.start, t.export.end];
    for (const ty of counted) {
      // The payroll code beside the name ("Paid leave (CP) left"): payroll
      // software maps the columns by it.
      const name = ty.payrollCode ? format(t.export.coded, { kind: typeName(ty, t.types), code: ty.payrollCode }) : typeName(ty, t.types);
      if (ty.period === "acquired") for (const h of [t.export.lastEarned, t.export.lastTaken, t.export.lastLeft, t.export.curEarned, t.export.curTaken, t.export.curLeft, t.export.carried]) header.push(format(h, { kind: name }));
      header.push(format(t.export.booked, { kind: name }), format(t.export.left, { kind: name }), format(t.export.waiting, { kind: name }));
    }
    const rows = ids
      .map(id => ({ id, name: nameOf(who.get(id), locale), st: staff.get(id) }))
      .sort((a, b) => a.name.localeCompare(b.name, locale))
      .map(({ id, name, st }) => {
        const line: (string | number)[] = [st?.employeeNumber ?? "", name, st?.startDate ?? "", st?.endDate ?? ""];
        for (const ty of counted) {
          const b = bal.get(id)?.find(x => x.typeId === ty.id);
          if (ty.period === "acquired") {
            const last = b?.years.last;
            const cur = b?.years.current;
            line.push(n(last?.credited ?? 0), n(last?.used ?? 0), n(last?.left ?? 0), n(cur?.credited ?? 0), n(cur?.used ?? 0), n(cur?.left ?? 0), n(b?.carried ?? 0));
          }
          line.push(n(b?.booked ?? 0), n(b ? b.left - b.booked : 0), n(b?.pending ?? 0));
        }
        return line;
      });
    const csv = toCsv([header, ...rows], t.export.separator === ";" ? ";" : ",");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${format(t.export.balancesFile, { day: on })}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return error.code === "forbidden" ? text("forbidden", 403) : text("invalid", 400);
    throw error;
  }
}
