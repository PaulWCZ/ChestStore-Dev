"use server";

import { revalidatePath } from "next/cache";
import type { Member } from "@argentic/chest-sdk/member";
import { db } from "../../lib/db.ts";
import { attempt, AppError, type Result } from "../../lib/errors.ts";
import * as bank from "../../lib/bank.ts";
import { can } from "../../lib/access.ts";
import * as cards from "../../lib/cards.ts";
import * as expenses from "../../lib/expenses.ts";
import { importExpenses as importLines, type Imported } from "../../lib/imports.ts";
import * as payments from "../../lib/payments.ts";
import { catalogue, isLocale } from "../../lib/i18n/index.ts";
import { holders, mayApprove, nameOf, people } from "../../lib/people.ts";
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
    // Guests of the Chest must be people the Chest knows here.
    const guests = expenses.guestsOf(input, actor.id).members;
    if (guests.length > 0 && [...(await people(guests)).values()].some(p => p.status === "unknown")) throw new AppError("invalid");
    const saved = await expenses.saveExpense(sql, actor, expenseId, input, file);
    if (saved.dropped) await forget([saved.dropped]);
    // A card payment's receipt arrived: the bell's "needs its receipt" goes
    // once none is missing.
    if (saved.expense.fromCard) {
      await tell.settleCardReceipts(sql, [actor.id]);
      await tell.refresh(sql, [actor.id]);
    }
    return { id: saved.expense.id };
  });
}

export async function saveTrip(expenseId: string | null, input: expenses.TripInput): Promise<Result<{ id: string }>> {
  return act(async actor => ({ id: (await expenses.saveTrip(db(), actor, expenseId, input)).id }));
}

export async function saveAllowance(expenseId: string | null, input: expenses.AllowanceInput): Promise<Result<{ id: string }>> {
  return act(async actor => ({ id: (await expenses.saveAllowance(db(), actor, expenseId, input)).id }));
}

export async function removeExpense(expenseId: string): Promise<Result> {
  return act(async actor => {
    const sql = db();
    await expenses.remove(sql, actor, expenseId);
    await tell.settleCardReceipts(sql, [actor.id]);
    await tell.refresh(sql, [actor.id]);
    return null;
  });
}

export async function restoreExpense(expenseId: string): Promise<Result> {
  return act(async actor => {
    const sql = db();
    await expenses.restore(sql, actor, expenseId);
    await tell.refresh(sql, [actor.id]);
    return null;
  });
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
  return act(async actor => {
    const sql = db();
    await tell.unpaid(sql, await expenses.unmarkPaid(sql, actor, ids));
    return null;
  });
}

// Settings.
export async function setVehicle(input: { kind: string; power: string; electric: boolean }): Promise<Result> {
  return act(async actor => {
    const sql = db();
    await settings.setVehicle(sql, actor, input);
    return null;
  });
}

export async function updateCompany(input: { currency?: string; reminder?: boolean; setupDone?: boolean; journal?: Partial<settings.Journal>; payer?: string; bankLocale?: string }): Promise<Result> {
  return act(async actor => { await settings.updateSettings(db(), actor, input); return null; });
}

export async function addCategory(input: { name: string; account?: string; vatRecovery?: number; cap?: string | null }): Promise<Result<{ id: string }>> {
  return act(async actor => ({ id: (await settings.addCategory(db(), actor, input)).id }));
}

export async function updateCategory(categoryId: string, input: { name?: string; account?: string; vatRecovery?: number; cap?: string | null; archived?: boolean; guests?: boolean; perNight?: boolean }): Promise<Result> {
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

// Bank details: the actor's own ("me"), a person's (accountants), the
// company's ("company"). Answers what the page shows: the masked account.
export async function saveBank(owner: string, input: { iban: string; bic?: string; holder?: string; street?: string; postcode?: string; town?: string; addressCountry?: string }): Promise<Result<{ masked: string }>> {
  return act(async actor => {
    const target = owner === "me" ? actor.id : owner;
    const saved = await bank.setBankDetails(db(), actor, target, input);
    await tell.bankChanged(actor, target, saved.masked.slice(-4));
    return { masked: saved.masked };
  });
}

export async function removeBank(owner: string): Promise<Result> {
  return act(async actor => { await bank.removeBankDetails(db(), actor, owner === "me" ? actor.id : owner); return null; });
}

// One transfer file for everyone to pay back who has bank details; the
// browser then downloads it (/chest/pay/files/<id>).
export async function makeTransferFile(executionDate: string): Promise<Result<{ id: string; count: number; total: number; skipped: number }>> {
  return act(async actor => {
    const sql = db();
    const made = await payments.createRun(sql, actor, { executionDate });
    await tell.paid(sql, actor, made.decisions, made.run.executionDate);
    return { id: made.run.id, count: made.run.count, total: made.run.total, skipped: made.skipped.length };
  });
}

export async function cancelTransferFile(runId: string): Promise<Result> {
  return act(async actor => {
    const sql = db();
    await tell.unpaid(sql, await payments.cancelRun(sql, actor, runId));
    return null;
  });
}

// The registration certificate of the actor's vehicle (an upload of
// theirs), or null to take it off.
export async function setVehicleProof(object: string | null, name?: string): Promise<Result> {
  return act(async actor => {
    const sql = db();
    const file = object === null ? null : await inspect(sql, actor, object);
    const dropped = await settings.setVehicleProof(sql, actor, file, name);
    if (dropped && dropped !== object) await forget([dropped]);
    return null;
  });
}

export async function checkVehicle(memberId: string, checked: boolean): Promise<Result> {
  return act(async actor => { await settings.checkVehicle(db(), actor, memberId, checked); return null; });
}

export async function setPriorDistance(year: number, distance: string): Promise<Result> {
  return act(async actor => { await expenses.setPriorDistance(db(), actor, { year, distance }); return null; });
}

export async function saveAllowanceRate(allowanceId: string | null, input: { name?: string; amount?: string; unit?: string; account?: string; archived?: boolean }): Promise<Result> {
  return act(async actor => { await settings.saveAllowanceRate(db(), actor, allowanceId, input); return null; });
}

// A company exchange rate ("" takes it off); answers how many expenses
// not yet approved it changed.
export async function setRate(currency: string, rate: string): Promise<Result<{ count: number }>> {
  return act(async actor => ({ count: await settings.setRate(db(), actor, currency, rate) }));
}

export async function setMemberAccount(memberId: string, account: string): Promise<Result> {
  return act(async actor => { await settings.setMemberAccount(db(), actor, memberId, account); return null; });
}

// Past expenses from the previous tool, their columns mapped in the page:
// the people they name are found in the team by name.
export async function importExpenses(lines: Record<string, string>[], dateOrder: string): Promise<Result<Imported>> {
  return act(async actor => importLines(db(), actor, { lines, dateOrder }, (await holders()).map(h => ({ id: h.id, name: h.name }))));
}

// A company card statement, read and mapped in the page: each payment
// matched to its expense, or a draft waiting for its receipt; the holders
// are asked for the missing receipts. The card holders must be people of
// the tool.
export async function importCardStatement(fileName: string, lines: cards.StatementLine[]): Promise<Result<Omit<cards.StatementResult, "owners">>> {
  return act(async actor => {
    const sql = db();
    const team = new Set((await holders()).filter(h => h.role !== null).map(h => h.id));
    const done = await cards.importStatement(sql, actor, { fileName, lines }, team);
    await tell.cardReceipts(sql, done.owners);
    const { owners: _owners, ...counts } = done;
    return counts;
  });
}

export async function undoCardStatement(statementId: string): Promise<Result> {
  return act(async actor => {
    const sql = db();
    const owners = await cards.undoStatement(sql, actor, statementId);
    await tell.settleCardReceipts(sql, owners);
    await tell.refresh(sql, owners);
    return null;
  });
}

// Asks a holder (or everyone owing some) again for their card receipts.
export async function remindCardReceipts(memberId?: string): Promise<Result<{ count: number }>> {
  return act(async actor => {
    if (!can(actor, "pay")) throw new AppError("forbidden");
    const sql = db();
    const owed = await cards.receiptsOwed(sql, memberId ? [memberId] : undefined);
    return { count: await tell.cardReceipts(sql, [...owed.keys()]) };
  });
}

export async function checkCardLine(lineId: string, checked: boolean): Promise<Result> {
  return act(async actor => { await cards.checkLine(db(), actor, lineId, checked); return null; });
}
