"use server";

import { revalidatePath } from "next/cache";
import type { Member } from "@argentic/chest-sdk/member";
import { db } from "../../lib/db.ts";
import { attempt, AppError, type Result } from "../../lib/errors.ts";
import * as expenses from "../../lib/expenses.ts";
import { catalogue, isLocale } from "../../lib/i18n/index.ts";
import { mayApprove, nameOf, people } from "../../lib/people.ts";
import { forget, inspect } from "../../lib/receipts.ts";
import { currentMember } from "../../lib/session.ts";
import * as settings from "../../lib/settings.ts";
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

// An expense with a receipt: `receipt` is the object the browser uploaded
// (checked here: it must be the member's own upload, arrived), null to take
// the receipt off, undefined to keep it.
export async function saveExpense(expenseId: string | null, input: expenses.ExpenseInput, receipt?: string | null): Promise<Result<{ id: string }>> {
  return act(async actor => {
    const sql = db();
    const file = typeof receipt === "string" ? await inspect(sql, actor, receipt) : receipt === null ? null : undefined;
    const saved = await expenses.saveExpense(sql, actor, expenseId, input, file);
    if (saved.dropped) await forget([saved.dropped]);
    return { id: saved.expense.id };
  });
}

export async function saveTrip(expenseId: string | null, input: expenses.TripInput): Promise<Result<{ id: string }>> {
  return act(async actor => ({ id: (await expenses.saveTrip(db(), actor, expenseId, input)).id }));
}

export async function removeExpense(expenseId: string): Promise<Result> {
  return act(async actor => { await expenses.remove(db(), actor, expenseId); return null; });
}

export async function restoreExpense(expenseId: string): Promise<Result> {
  return act(async actor => { await expenses.restore(db(), actor, expenseId); return null; });
}

// Sends drafts; answers how many and to whom, in the sender's words.
export async function sendExpenses(ids: string[]): Promise<Result<{ count: number; to: string }>> {
  return act(async actor => {
    const sql = db();
    const sent = await expenses.submit(sql, actor, ids, mayApprove);
    await tell.sent(sql, actor, sent);
    const locale = isLocale(actor.locale) ? actor.locale : "en";
    const to = sent.approver ? nameOf((await people([sent.approver])).get(sent.approver), locale) : catalogue(locale).people.accountants;
    return { count: sent.expenses.length, to };
  });
}

export async function decideExpenses(ids: string[], verdict: "approve" | "refuse", reason?: string): Promise<Result<{ count: number; owner: string }>> {
  return act(async actor => {
    const sql = db();
    const decisions = await expenses.decide(sql, actor, ids, verdict, reason);
    await tell.decided(sql, actor, decisions, verdict, reason ?? "");
    const owner = decisions[0]?.owner ?? "";
    const locale = isLocale(actor.locale) ? actor.locale : "en";
    return { count: decisions.reduce((n, d) => n + d.expenses.length, 0), owner: nameOf((await people([owner])).get(owner), locale) };
  });
}

export async function markPaid(ids: string[], paidOn: string): Promise<Result> {
  return act(async actor => {
    const sql = db();
    const done = await expenses.markPaid(sql, actor, ids, paidOn);
    await tell.paid(sql, actor, done, paidOn);
    return null;
  });
}

export async function unmarkPaid(ids: string[]): Promise<Result> {
  return act(async actor => { await expenses.unmarkPaid(db(), actor, ids); return null; });
}

// Settings.
export async function setVehicle(input: { kind: string; power: string; electric: boolean }): Promise<Result> {
  return act(async actor => {
    const sql = db();
    await settings.setVehicle(sql, actor, input);
    return null;
  });
}

export async function updateCompany(input: { currency?: string; reminder?: boolean }): Promise<Result> {
  return act(async actor => { await settings.updateSettings(db(), actor, input); return null; });
}

export async function addCategory(input: { name: string; account?: string; vatRecovery?: number; cap?: string | null }): Promise<Result<{ id: string }>> {
  return act(async actor => ({ id: (await settings.addCategory(db(), actor, input)).id }));
}

export async function updateCategory(categoryId: string, input: { name?: string; account?: string; vatRecovery?: number; cap?: string | null; archived?: boolean }): Promise<Result> {
  return act(async actor => { await settings.updateCategory(db(), actor, categoryId, input); return null; });
}

export async function setApprover(memberId: string, approverId: string | null): Promise<Result<{ name: string }>> {
  return act(async actor => {
    const sql = db();
    const previous = await settings.setApprover(sql, actor, memberId, approverId, mayApprove);
    await tell.settleWaiting(sql, [memberId]);
    await tell.refresh(sql, [memberId, ...previous, ...(approverId ? [approverId] : [])]);
    const locale = isLocale(actor.locale) ? actor.locale : "en";
    const t = catalogue(locale);
    return { name: approverId ? nameOf((await people([approverId])).get(approverId), locale) : t.settings.approvers.accountants };
  });
}

export async function saveScale(year: number, data: unknown, source: string): Promise<Result> {
  return act(async actor => {
    const sql = db();
    await settings.saveScale(sql, actor, year, data, source);
    await expenses.recomputeAllTrips(sql);
    return null;
  });
}
