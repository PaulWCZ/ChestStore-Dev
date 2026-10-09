import { action, after, field, redirect, type Field } from "@argentic/chest-app";
import { can } from "./lib/access.ts";
import { AppError } from "./lib/app-error.ts";
import * as balances from "./lib/balances.ts";
import { db } from "./lib/db.ts";
import { everyone } from "./lib/directory.ts";
import { catalogue, locales } from "./i18n/index.ts";
import { planImport, planLeave, type ImportPlan, type KindMap, type KindNames, type LeavePlan, type Mapping, type Person } from "./lib/import.ts";
import * as requests from "./lib/requests.ts";
import * as rules from "./lib/rules.ts";
import * as share from "./lib/share.ts";
import * as staff from "./lib/staff.ts";
import * as tell from "./lib/tell.ts";

// Every mutation of Leave, by name (POST /chest/actions/<name>): the member
// is the one the Chest asserts on each call, never anything in the input.
// An island calls them with call("askLeave", {…}); the page refreshes
// after each (unless the island says otherwise). The rules are in
// src/lib/ — every service takes (sql, actor, …input), checks who may do
// what from the actor, reads and bounds its input itself, and refuses with
// a code the reader sees in their words (src/i18n, errors). The fields
// below only take what was sent ("as sent"): the services check it.
//
// After every change that went through, what Rooms and People are told,
// the calendar feeds and the busy times told to Booking and Hiring follow,
// once the answer is sent (only what changed goes: src/lib/share.ts).

// A value as sent, for a service that reads and checks it; W: what an
// island may send (the type call() checks).
const sent = <W>(): Field<unknown, W> => ({ read: value => value });
// A text as sent (a form's field, a JSON string), "" when absent; the
// service trims, bounds and refuses.
const text: Field<string, string> = { read: value => (value === undefined || value === null ? "" : typeof value === "string" ? value.slice(0, 600_000) : String(value)) };
const one = { id: field.id() };

function keepInLine(): void {
  after("leave in line", () => share.keepInLine(db()));
}

// The kinds of leave as the imports name them: HR's own name, the key, and
// the built-in name in every language.
async function kindNames(options: { balances?: boolean } = {}): Promise<KindNames[]> {
  const all = (await rules.types(db())).filter(t => !options.balances || t.balance);
  return all.map(t => ({ typeId: t.id, key: t.key, split: t.period === "acquired", names: [t.name ?? "", ...(t.key ? [t.key, ...locales.map(l => catalogue(l).types[t.key as keyof ReturnType<typeof catalogue>["types"]])] : [])] }));
}

async function directoryWithNumbers(): Promise<Person[]> {
  const [dir, known] = await Promise.all([everyone(), staff.allStaff(db())]);
  return dir.map(p => ({ id: p.id, name: p.name, firstName: p.firstName, lastName: p.lastName, employeeNumber: known.get(p.id)?.employeeNumber ?? null }));
}

const peopleImport = { text, mapping: sent<Mapping>() };
const leaveImport = { text, mapping: sent<Mapping>(), kindMap: sent<KindMap>() };
const asMapping = (value: unknown): Mapping => (value !== null && typeof value === "object" && !Array.isArray(value) ? value as Mapping : {});

export const actions = {
  // ——— Requests ———

  // Ask (or record for someone: memberId); then the page the person came
  // from says it was sent, declared or recorded.
  askLeave: action({
    typeId: field.id(), start: sent<string>(), startHalf: sent<"am" | "pm">(), end: sent<string>(), endHalf: sent<"am" | "pm">(),
    note: field.optional(text), memberId: field.optional(text), event: field.optional(text),
  }, async (input, { member }): Promise<never> => {
    const sql = db();
    const r = await requests.createRequest(sql, member, input);
    if (r.memberId !== member.id) await tell.recorded(sql, member, r);
    else await tell.asked(sql, member, r);
    keepInLine();
    return redirect(r.memberId !== member.id ? `/chest/people/${r.memberId}?done=recorded` : r.status === "approved" ? "/chest?done=declared" : "/chest?done=sent");
  }),

  // A waiting request is cancelled at once ("cancelled": its Undo is
  // restoreLeave); an approved one is asked to the approver ("asked").
  cancelLeave: action(one, async ({ id }, { member }): Promise<"cancelled" | "asked"> => {
    const sql = db();
    const outcome = await requests.cancel(sql, member, id);
    const r = await requests.request(sql, member, id);
    if (outcome === "cancelled") await tell.withdrawn(sql, r);
    else await tell.cancelAsked(sql, member, r);
    keepInLine();
    return outcome;
  }),

  restoreLeave: action(one, async ({ id }, { member }): Promise<null> => {
    const sql = db();
    const r = await requests.restore(sql, member, id);
    await tell.asked(sql, member, r);
    keepInLine();
    return null;
  }),

  answer: action({ ...one, verdict: field.choice(["approve", "refuse"] as const), reason: field.optional(text) }, async ({ id, verdict, reason }, { member }): Promise<null> => {
    const sql = db();
    const r = await requests.decide(sql, member, id, { verdict, reason: reason ?? "" });
    await tell.answered(sql, member, r);
    keepInLine();
    return null;
  }),

  // An answer taken back (within ten minutes): the request waits again.
  takeBack: action(one, async ({ id }, { member }): Promise<null> => {
    const sql = db();
    const r = await requests.reopen(sql, member, id);
    await tell.reopened(sql, member, r);
    keepInLine();
    return null;
  }),

  settleCancel: action({ ...one, accept: field.bool(), reason: field.optional(text) }, async ({ id, accept, reason }, { member }): Promise<null> => {
    const sql = db();
    const r = await requests.settleCancel(sql, member, id, { accept, reason: reason ?? "" });
    await tell.cancelSettled(sql, member, r);
    keepInLine();
    return null;
  }),

  // ——— People (HR) ———

  setApprover: action({ memberId: text, approverId: field.nullable(text) }, async ({ memberId, approverId }, { member }): Promise<null> => {
    const sql = db();
    await staff.setApprover(sql, member, memberId, approverId ?? null);
    await tell.refreshBadges(sql);
    keepInLine();
    return null;
  }),

  setStartDate: action({ memberId: text, day: field.nullable(text) }, async ({ memberId, day }, { member }): Promise<null> => {
    await staff.setStartDate(db(), member, memberId, day ?? null);
    keepInLine();
    return null;
  }),

  // A last day may cancel or shorten leave after it: how much, for the toast.
  setEndDate: action({ memberId: text, day: field.nullable(text) }, async ({ memberId, day }, { member }): Promise<{ settled: number; days: number }> => {
    const sql = db();
    const done = await staff.setEndDate(sql, member, memberId, day ?? null);
    for (const id of done.cancelled) await tell.withdrawn(sql, { id });
    keepInLine();
    return { settled: done.cancelled.length + done.cut.length, days: done.days };
  }),

  setWorkDays: action({ memberId: text, days: sent<number[] | null>() }, async ({ memberId, days }, { member }): Promise<null> => {
    await staff.setWorkDays(db(), member, memberId, days);
    keepInLine();
    return null;
  }),

  setEmployeeNumber: action({ memberId: text, value: text }, async ({ memberId, value }, { member }): Promise<null> => {
    await staff.setEmployeeNumber(db(), member, memberId, value);
    keepInLine();
    return null;
  }),

  // Days are sent as typed ("2,5"): the service reads them.
  adjustBalance: action({ memberId: text, typeId: text, days: text, reason: text, bucket: field.optional(text) }, async (input, { member }): Promise<null> => {
    await balances.adjust(db(), member, input);
    keepInLine();
    return null;
  }),

  setBalance: action({ memberId: text, typeId: text, days: text, earning: field.optional(text), onDate: text, reason: text }, async (input, { member }): Promise<null> => {
    await balances.setOpening(db(), member, input);
    keepInLine();
    return null;
  }),

  giveEveryone: action({ typeId: text, days: text, reason: text }, async (input, { member }): Promise<number> => {
    if (!can(member, "people.all")) throw new AppError("forbidden");
    const n = await balances.giveEveryone(db(), member, input, (await everyone()).map(p => p.id));
    keepInLine();
    return n;
  }),

  // ——— The imports: checked first (nothing written), then applied — the
  // file is read again on the server, never trusted from the check. ———

  checkImport: action(peopleImport, async ({ text: file, mapping }, { member }): Promise<ImportPlan> => {
    if (!can(member, "people.all")) throw new AppError("forbidden");
    return planImport(file, await kindNames({ balances: true }), await directoryWithNumbers(), asMapping(mapping));
  }),

  applyImport: action({ ...peopleImport, onDate: text, reason: text }, async ({ text: file, mapping, onDate, reason }, { member }): Promise<{ balances: number; people: number }> => {
    if (!can(member, "people.all")) throw new AppError("forbidden");
    const sql = db();
    const p = planImport(file, await kindNames({ balances: true }), await directoryWithNumbers(), asMapping(mapping));
    const ok = p.rows.filter(r => r.problem === null && r.memberId);
    const rows = ok.flatMap(r => r.values.map(v => ({ memberId: r.memberId!, ...v })));
    const n = rows.length > 0 ? await balances.openings(sql, member, rows, onDate, reason) : 0;
    const touched = new Set<string>();
    for (const r of ok) {
      if (r.start) { await staff.setStartDate(sql, member, r.memberId, r.start); touched.add(r.memberId!); }
      if (r.number) { await staff.setEmployeeNumber(sql, member, r.memberId, r.number); touched.add(r.memberId!); }
    }
    if (n === 0 && touched.size === 0) throw new AppError("import_empty");
    keepInLine();
    return { balances: n, people: touched.size };
  }),

  checkLeaveImport: action(leaveImport, async ({ text: file, mapping, kindMap }, { member }): Promise<LeavePlan> => {
    if (!can(member, "people.all")) throw new AppError("forbidden");
    return planLeave(file, await kindNames(), await directoryWithNumbers(), asMapping(mapping), asMapping(kindMap) as KindMap);
  }),

  applyLeaveImport: action({ ...leaveImport, counted: field.bool(), reason: text }, async ({ text: file, mapping, kindMap, counted, reason }, { member }): Promise<{ done: number; skipped: { line: number; problem: string }[] }> => {
    if (!can(member, "people.all")) throw new AppError("forbidden");
    const sql = db();
    const p = planLeave(file, await kindNames(), await directoryWithNumbers(), asMapping(mapping), asMapping(kindMap) as KindMap);
    const lines = p.rows.filter(r => r.problem === null && r.memberId && r.typeId && r.start && r.end)
      .map(r => ({ line: r.line, memberId: r.memberId!, typeId: r.typeId!, start: r.start!, startHalf: r.startHalf, end: r.end!, endHalf: r.endHalf }));
    const result = await requests.importLeave(sql, member, lines, counted, reason);
    await tell.refreshBadges(sql);
    keepInLine();
    return { done: result.done.length, skipped: result.skipped };
  }),

  // ——— Settings (HR): only what changed is sent. ———

  saveSettings: action({ counting: field.optional(field.choice(["ouvres", "ouvrables"] as const)), alsace: sent<boolean | undefined>(), workedHolidays: sent<string[] | undefined>(), periodStartMonth: sent<number | undefined>() }, async (input, { member }): Promise<null> => {
    await rules.updateSettings(db(), member, input);
    keepInLine();
    return null;
  }),

  saveType: action({ typeId: field.nullable(field.id()), input: sent<rules.TypeInput>() }, async ({ typeId, input }, { member }): Promise<{ id: string }> => {
    const saved = await rules.saveType(db(), member, typeId ?? null, input !== null && typeof input === "object" ? input as rules.TypeInput : {});
    keepInLine();
    return { id: saved.id };
  }),

  archiveType: action({ ...one, archived: field.bool() }, async ({ id, archived }, { member }): Promise<null> => {
    await rules.archiveType(db(), member, id, archived);
    keepInLine();
    return null;
  }),
};
