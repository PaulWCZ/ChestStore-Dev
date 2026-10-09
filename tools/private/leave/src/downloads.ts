import type { Download } from "@argentic/chest-app";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./lib/access.ts";
import { AppError } from "./lib/app-error.ts";
import { balancesOf } from "./lib/balances.ts";
import { isDay } from "./shared/calendar.ts";
import { toCsv } from "./lib/csv.ts";
import { db } from "./lib/db.ts";
import { everyoneOrNone } from "./lib/directory.ts";
import { catalogue, format, formatNumber, localeOf } from "./i18n/index.ts";
import { lastPayrollDay } from "./shared/model.ts";
import { payroll } from "./lib/payroll.ts";
import { people, plainName } from "./lib/people.ts";
import { types } from "./lib/rules.ts";
import { allStaff, formerIds } from "./lib/staff.ts";
import { today } from "./lib/today.ts";
import { typeName } from "./shared/type-name.ts";

// Payroll's two files (src/app.tsx: /chest/people/export and
// /chest/people/balances, served by the package's download()), for the
// member the Chest asserts. A refusal is a code (AppError): download()
// shows it as a page in the reader's words — 403 for anyone but HR, 400
// for a month or a day that cannot be.

const file = (text: string, name: string): Download => ({ name, type: "text/csv; charset=utf-8", body: text });

// The payroll export of a month, as a CSV for a spreadsheet or the payroll
// provider: HR only, in the reader's language, names resolved now; each
// absence with its kind's payroll code (CP, RTT, MAL…), which payroll
// software imports by.
export async function absencesFile(url: URL, actor: Member): Promise<Download> {
  const month = url.searchParams.get("month") ?? "";
  const locale = localeOf(actor.language);
  const t = catalogue(locale);
  const rows = await payroll(db(), actor, month);
  const [all, who] = await Promise.all([types(db(), { archived: true }), people(rows.map(r => r.memberId))]);
  const typeOf = new Map(all.map(ty => [ty.id, ty]));
  const numberOf = (n: number) => formatNumber(n, locale, { grouping: false });
  const lines = rows
    .map(r => ({ ...r, name: r.memberId === "erased" ? t.people.erased : plainName(who.get(r.memberId), locale) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale) || a.start.localeCompare(b.start));
  const csv = toCsv([
    [t.export.number, t.export.person, t.export.type, t.export.code, t.export.firstDay, t.export.firstHalf, t.export.lastDay, t.export.lastHalf, t.export.daysInMonth, t.export.days],
    ...lines.map(r => [r.employeeNumber ?? "", r.name, typeName(typeOf.get(r.typeId), t.types), typeOf.get(r.typeId)?.payrollCode ?? "", r.start, r.startHalf === "am" ? t.export.morning : t.export.noon, r.end, r.endHalf === "am" ? t.export.noon : t.export.evening, numberOf(r.daysInMonth), numberOf(r.days)]),
  ], t.export.separator === ";" ? ";" : ",");
  return file(csv, format(t.export.file, { month }));
}

// Everyone's balances on a day, as the pay slip shows them: for paid leave
// the days acquired (CP N-1: earned, taken, left) and being earned (CP N),
// days carried over, leave approved for later, what is left; for other
// kinds what is left. Everyone the tool knows, those who left included
// (their last day: the balance payroll pays when the contract ends). HR
// only, in the reader's language, with the employee number payroll imports
// by.
export async function balancesFile(url: URL, actor: Member): Promise<Download> {
  const locale = localeOf(actor.language);
  const t = catalogue(locale);
  if (!can(actor, "export")) throw new AppError("forbidden");
  // Any day up to the end of next month: payroll is prepared around the
  // 20th for the month's end (a projection: earned months added, leave
  // approved up to that day taken — said in the file's name).
  const now = today();
  const on = url.searchParams.get("on") || now;
  if (!isDay(on) || on > lastPayrollDay(now)) throw new AppError("invalid");
  const sql = db();
  const [dir, staff, all, gone] = await Promise.all([everyoneOrNone(), allStaff(sql), types(sql), formerIds(sql)]);
  const ids = [...new Set([...dir.people.map(p => p.id), ...gone])];
  const [bal, who] = await Promise.all([balancesOf(sql, ids, on, { takenBy: true, endOfDay: true }), people(ids)]);
  const counted = all.filter(ty => ty.balance);
  const n = (x: number) => formatNumber(x, locale, { grouping: false });
  const header: string[] = [t.export.number, t.export.person, t.export.start, t.export.end];
  for (const ty of counted) {
    // The payroll code beside the name ("Paid leave (CP) left"): payroll
    // software maps the columns by it.
    const name = ty.payrollCode ? format(t.export.coded, { kind: typeName(ty, t.types), code: ty.payrollCode }) : typeName(ty, t.types);
    if (ty.period === "acquired") for (const h of [t.export.lastEarned, t.export.lastTaken, t.export.lastLeft, t.export.curEarned, t.export.curTaken, t.export.curLeft, t.export.carried]) header.push(format(h, { kind: name }));
    header.push(format(t.export.booked, { kind: name }), format(t.export.left, { kind: name }), format(t.export.waiting, { kind: name }));
  }
  const rows = ids
    // The name as it is — never "(former member)": payroll matches on it;
    // the last day says who left.
    .map(id => ({ id, name: plainName(who.get(id), locale), st: staff.get(id) }))
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
  return file(csv, format(on > now ? t.export.balancesFileProjected : t.export.balancesFile, { day: on }));
}
