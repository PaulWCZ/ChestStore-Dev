"use server";

import type { Member } from "@argentic/chest-sdk/member";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { can } from "../../lib/access.ts";
import * as balances from "../../lib/balances.ts";
import { db } from "../../lib/db.ts";
import { everyone } from "../../lib/directory.ts";
import { attempt, AppError, type Result } from "../../lib/errors.ts";
import { catalogue, locales } from "../../lib/i18n/index.ts";
import { planImport, planLeave, type ImportPlan, type KindMap, type KindNames, type LeavePlan, type Mapping, type Person } from "../../lib/import.ts";
import * as requests from "../../lib/requests.ts";
import * as rules from "../../lib/rules.ts";
import * as share from "../../lib/share.ts";
import { currentMember } from "../../lib/session.ts";
import * as staff from "../../lib/staff.ts";
import * as tell from "../../lib/tell.ts";
import * as mail from "../../lib/mail.ts";

// The server actions of the members' part. Each is an endpoint anyone can
// call: each reads the member from the Chest's assertion again; the
// services check their rights. They answer codes, never sentences, and
// refresh the pages of /chest.

async function act<T>(step: (actor: Member) => Promise<T>): Promise<Result<T>> {
  const result = await attempt(async () => {
    const actor = await currentMember();
    if (!actor) throw new AppError("forbidden");
    return step(actor);
  });
  revalidatePath("/chest", "layout");
  // The calendar feeds and the busy times told to Booking follow, once the
  // answer is sent (only what changed goes).
  if (result.ok) after(() => share.keepInLine(db()));
  return result;
}

// Requests.
export async function askLeave(input: requests.RequestInput): Promise<Result<{ id: string; status: requests.Status }>> {
  return act(async actor => {
    const r = await requests.createRequest(db(), actor, input);
    if (r.memberId !== actor.id) await tell.recorded(db(), actor, r);
    else await tell.asked(db(), actor, r);
    await share.approved(r);
    return { id: r.id, status: r.status };
  });
}

export async function cancelLeave(requestId: string): Promise<Result<"cancelled" | "asked">> {
  return act(async actor => {
    const outcome = await requests.cancel(db(), actor, requestId);
    const r = await requests.request(db(), actor, requestId);
    if (outcome === "cancelled") await tell.withdrawn(db(), r);
    else await tell.cancelAsked(db(), actor, r);
    return outcome;
  });
}

export async function restoreLeave(requestId: string): Promise<Result<null>> {
  return act(async actor => {
    const r = await requests.restore(db(), actor, requestId);
    await tell.asked(db(), actor, r);
    return null;
  });
}

export async function answer(requestId: string, verdict: "approve" | "refuse", reason: string): Promise<Result<null>> {
  return act(async actor => {
    const r = await requests.decide(db(), actor, requestId, { verdict, reason });
    await tell.answered(db(), actor, r);
    await share.approved(r);
    return null;
  });
}

export async function takeBack(requestId: string): Promise<Result<null>> {
  return act(async actor => {
    const r = await requests.reopen(db(), actor, requestId);
    await tell.reopened(db(), actor, r);
    await share.cancelled(r);
    return null;
  });
}

export async function settleCancel(requestId: string, accept: boolean, reason: string): Promise<Result<null>> {
  return act(async actor => {
    const r = await requests.settleCancel(db(), actor, requestId, { accept, reason });
    await tell.cancelSettled(db(), actor, r);
    if (r.status === "cancelled") await share.cancelled(r);
    return null;
  });
}

// People (HR).
export async function setApprover(memberId: string, approverId: string | null): Promise<Result<null>> {
  return act(async actor => {
    await staff.setApprover(db(), actor, memberId, approverId);
    await tell.refreshBadges(db());
    return null;
  });
}

export async function setStartDate(memberId: string, day: string | null): Promise<Result<null>> {
  return act(async actor => { await staff.setStartDate(db(), actor, memberId, day); return null; });
}

export async function setEndDate(memberId: string, day: string | null): Promise<Result<{ settled: number; days: number }>> {
  return act(async actor => {
    const done = await staff.setEndDate(db(), actor, memberId, day);
    for (const id of done.cancelled) await tell.withdrawn(db(), { id });
    return { settled: done.cancelled.length + done.cut.length, days: done.days };
  });
}

export async function setWorkDays(memberId: string, days: number[] | null): Promise<Result<null>> {
  return act(async actor => { await staff.setWorkDays(db(), actor, memberId, days); return null; });
}

export async function setEmployeeNumber(memberId: string, value: string): Promise<Result<null>> {
  return act(async actor => { await staff.setEmployeeNumber(db(), actor, memberId, value); return null; });
}

export async function adjustBalance(input: { memberId: string; typeId: string; days: string; reason: string; bucket?: string }): Promise<Result<null>> {
  return act(async actor => { await balances.adjust(db(), actor, input); return null; });
}

export async function setBalance(input: { memberId: string; typeId: string; days: string; earning?: string; onDate: string; reason: string }): Promise<Result<null>> {
  return act(async actor => { await balances.setOpening(db(), actor, input); return null; });
}

export async function giveEveryone(input: { typeId: string; days: string; reason: string }): Promise<Result<number>> {
  return act(async actor => {
    if (!can(actor, "people.all")) throw new AppError("forbidden");
    return balances.giveEveryone(db(), actor, input, (await everyone()).map(p => p.id));
  });
}

// The imports: checked first (nothing written), then applied — the file is
// read again on the server, never trusted from the check.
async function kindNames(options: { balances?: boolean } = {}): Promise<KindNames[]> {
  const all = (await rules.types(db())).filter(t => !options.balances || t.balance);
  return all.map(t => ({ typeId: t.id, key: t.key, split: t.period === "acquired", names: [t.name ?? "", ...(t.key ? [t.key, ...locales.map(l => catalogue(l).types[t.key!])] : [])] }));
}

async function directoryWithNumbers(): Promise<Person[]> {
  const [dir, known] = await Promise.all([everyone(), staff.allStaff(db())]);
  return dir.map(p => ({ id: p.id, name: p.name, firstName: p.firstName, lastName: p.lastName, employeeNumber: known.get(p.id)?.employeeNumber ?? null }));
}

async function plan(text: string, mapping: Mapping): Promise<ImportPlan> {
  return planImport(text, await kindNames({ balances: true }), await directoryWithNumbers(), mapping);
}

export async function checkImport(text: string, mapping: Mapping = {}): Promise<Result<ImportPlan>> {
  return act(async actor => {
    if (!can(actor, "people.all")) throw new AppError("forbidden");
    return plan(text, mapping);
  });
}

export async function applyImport(text: string, mapping: Mapping, onDate: string, reason: string): Promise<Result<{ balances: number; people: number }>> {
  return act(async actor => {
    if (!can(actor, "people.all")) throw new AppError("forbidden");
    const p = await plan(text, mapping);
    const ok = p.rows.filter(r => r.problem === null && r.memberId);
    const rows = ok.flatMap(r => r.values.map(v => ({ memberId: r.memberId!, ...v })));
    const n = rows.length > 0 ? await balances.openings(db(), actor, rows, onDate, reason) : 0;
    const touched = new Set<string>();
    for (const r of ok) {
      if (r.start) { await staff.setStartDate(db(), actor, r.memberId, r.start); touched.add(r.memberId!); }
      if (r.number) { await staff.setEmployeeNumber(db(), actor, r.memberId, r.number); touched.add(r.memberId!); }
    }
    if (n === 0 && touched.size === 0) throw new AppError("import_empty");
    return { balances: n, people: touched.size };
  });
}

export async function checkLeaveImport(text: string, mapping: Mapping = {}, kindMap: KindMap = {}): Promise<Result<LeavePlan>> {
  return act(async actor => {
    if (!can(actor, "people.all")) throw new AppError("forbidden");
    return planLeave(text, await kindNames(), await directoryWithNumbers(), mapping, kindMap);
  });
}

export async function applyLeaveImport(text: string, mapping: Mapping, kindMap: KindMap, counted: boolean, reason: string): Promise<Result<{ done: number; skipped: { line: number; problem: string }[] }>> {
  return act(async actor => {
    if (!can(actor, "people.all")) throw new AppError("forbidden");
    const p = planLeave(text, await kindNames(), await directoryWithNumbers(), mapping, kindMap);
    const lines = p.rows.filter(r => r.problem === null && r.memberId && r.typeId && r.start && r.end)
      .map(r => ({ line: r.line, memberId: r.memberId!, typeId: r.typeId!, start: r.start!, startHalf: r.startHalf, end: r.end!, endHalf: r.endHalf }));
    const result = await requests.importLeave(db(), actor, lines, counted === true, reason);
    for (const r of result.done) await share.approved(r);
    await tell.refreshBadges(db());
    return { done: result.done.length, skipped: result.skipped };
  });
}

// Settings (HR).
export async function saveSettings(input: { counting?: string; alsace?: boolean; workedHolidays?: string[]; periodStartMonth?: number }): Promise<Result<null>> {
  return act(async actor => { await rules.updateSettings(db(), actor, input); return null; });
}

export async function saveType(typeId: string | null, input: rules.TypeInput): Promise<Result<{ id: string }>> {
  return act(async actor => ({ id: (await rules.saveType(db(), actor, typeId, input)).id }));
}

export async function archiveType(typeId: string, archived: boolean): Promise<Result<null>> {
  return act(async actor => { await rules.archiveType(db(), actor, typeId, archived); return null; });
}

// Emails beside the bell: the person's own switch.
export async function setEmail(on: boolean): Promise<Result<null>> {
  return act(async actor => { await mail.setEmail(db(), actor, on); return null; });
}
