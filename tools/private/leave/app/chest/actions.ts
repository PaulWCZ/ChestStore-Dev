"use server";

import type { Member } from "@argentic/chest-sdk/member";
import { revalidatePath } from "next/cache";
import { can } from "../../lib/access.ts";
import * as balances from "../../lib/balances.ts";
import { db } from "../../lib/db.ts";
import { everyone } from "../../lib/directory.ts";
import { attempt, AppError, type Result } from "../../lib/errors.ts";
import { catalogue, locales } from "../../lib/i18n/index.ts";
import { planImport, type ImportPlan } from "../../lib/import.ts";
import * as requests from "../../lib/requests.ts";
import * as rules from "../../lib/rules.ts";
import { currentMember } from "../../lib/session.ts";
import * as staff from "../../lib/staff.ts";
import * as tell from "../../lib/tell.ts";

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
  return result;
}

// Requests.
export async function askLeave(input: requests.RequestInput): Promise<Result<{ id: string; status: requests.Status }>> {
  return act(async actor => {
    const r = await requests.createRequest(db(), actor, input);
    await tell.asked(db(), actor, r);
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
    return null;
  });
}

export async function takeBack(requestId: string): Promise<Result<null>> {
  return act(async actor => {
    const r = await requests.reopen(db(), actor, requestId);
    await tell.reopened(db(), actor, r);
    return null;
  });
}

export async function settleCancel(requestId: string, accept: boolean, reason: string): Promise<Result<null>> {
  return act(async actor => {
    const r = await requests.settleCancel(db(), actor, requestId, { accept, reason });
    await tell.cancelSettled(db(), actor, r);
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

export async function adjustBalance(input: { memberId: string; typeId: string; days: string; reason: string }): Promise<Result<null>> {
  return act(async actor => { await balances.adjust(db(), actor, input); return null; });
}

export async function setBalance(input: { memberId: string; typeId: string; days: string; onDate: string; reason: string }): Promise<Result<null>> {
  return act(async actor => { await balances.setOpening(db(), actor, input); return null; });
}

export async function giveEveryone(input: { typeId: string; days: string; reason: string }): Promise<Result<number>> {
  return act(async actor => {
    if (!can(actor, "people.all")) throw new AppError("forbidden");
    return balances.giveEveryone(db(), actor, input, (await everyone()).map(p => p.id));
  });
}

// The import: checked first (nothing written), then applied — the file is
// read again on the server, never trusted from the check.
async function plan(text: string): Promise<ImportPlan> {
  const all = await rules.types(db());
  const names = all.filter(t => t.balance).map(t => ({ typeId: t.id, names: [t.name ?? "", ...(t.key ? [t.key, ...locales.map(l => catalogue(l).types[t.key!])] : [])] }));
  return planImport(text, names, await everyone());
}

export async function checkImport(text: string): Promise<Result<ImportPlan>> {
  return act(async actor => {
    if (!can(actor, "people.all")) throw new AppError("forbidden");
    return plan(text);
  });
}

export async function applyImport(text: string, onDate: string, reason: string): Promise<Result<number>> {
  return act(async actor => {
    if (!can(actor, "people.all")) throw new AppError("forbidden");
    const p = await plan(text);
    const rows = p.rows.filter(r => r.problem === null && r.memberId).flatMap(r => r.values.map(v => ({ memberId: r.memberId!, ...v })));
    return balances.openings(db(), actor, rows, onDate, reason);
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
