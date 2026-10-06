import { action, fail, type Field } from "@argentic/chest-app";
import { approversFor } from "./lib/approvals.ts";
import * as bank from "./lib/bank.ts";
import { can } from "./lib/access.ts";
import * as cards from "./lib/cards.ts";
import { db } from "./lib/db.ts";
import * as expenses from "./lib/expenses.ts";
import { importExpenses as importLines, type Imported } from "./lib/imports.ts";
import * as payments from "./lib/payments.ts";
import { holders, mayApprove, nameOf, people } from "./lib/people.ts";
import { forget, grant, inspect } from "./lib/receipts.ts";
import * as settings from "./lib/settings.ts";
import * as tell from "./lib/tell.ts";
import { catalogue, localeOf } from "./i18n/index.ts";

// Every mutation of Expenses, by name, at POST /chest/actions/<name>,
// called from the islands with call("name", { … }). The member is the one
// the Chest asserts on each call (never a value sent); the services of
// src/lib/ check what they may do and read every value sent (they take
// `unknown` and refuse with a code), so a field here passes what the
// island sent as it is — an amount as the person typed it ("42,50"), never
// a number made in the browser. Each answers plain data; call() then
// refreshes the page (or the island moves on by itself: refresh: false).
//
// Services that read then write (decide, pay, send, make a transfer file)
// lock their rows in one transaction: call() sends actions at once, never
// one after another, and two of them on the same expense never both win.

// A value the service reads itself; T is what the island sends. maybe():
// the same, which the island may leave out.
const given = <T,>(): Field<unknown, T> => ({ read: value => value });
const maybe = <T,>(): Field<unknown, T> & { readonly omissible: true } => ({ omissible: true, read: value => value });
// Imports carry their lines: up to 2,000 (src/shared/model.ts), 8 MiB at most.
const lines = { maxBody: 8 << 20 };

export const actions = {
  // ---- One's own expenses.
  // A receipt goes from the browser to the Chest: this authorises that one
  // upload (the tool names the object), the island PUTs the file, then the
  // save checks it arrived (lib/receipts.ts).
  grantUpload: action({ type: given<string>(), size: given<number>() }, async (input, { member }): Promise<{ url: string; method: string; object: string }> => grant(db(), member, input)),

  // `receipt`: the object the browser uploaded (checked here: it must be the
  // member's own upload, arrived), null to take the receipt off, absent to
  // keep it.
  saveExpense: action({ id: given<string | null>(), input: given<expenses.ExpenseInput>(), receipt: maybe<string | null>() }, async ({ id, input, receipt }, { member }): Promise<{ id: string }> => {
    const sql = db();
    const file = typeof receipt === "string" ? await inspect(sql, member, receipt) : receipt === null ? null : undefined;
    // Guests of the Chest must be people the Chest knows here.
    const fields = (input ?? {}) as expenses.ExpenseInput;
    const guests = expenses.guestsOf(fields, member.id).members;
    if (guests.length > 0 && [...(await people(guests)).values()].some(p => p.status === "unknown")) fail("invalid");
    const saved = await expenses.saveExpense(sql, member, id, fields, file);
    if (saved.dropped) await forget([saved.dropped]);
    // A card payment's receipt arrived: the bell's "needs its receipt" goes
    // once none is missing.
    if (saved.expense.fromCard) {
      await tell.settleCardReceipts(sql, [member.id]);
      await tell.refresh(sql, [member.id]);
    }
    return { id: saved.expense.id };
  }),
  saveTrip: action({ id: given<string | null>(), input: given<expenses.TripInput>() }, async ({ id, input }, { member }): Promise<{ id: string }> => ({ id: (await expenses.saveTrip(db(), member, id, (input ?? {}) as expenses.TripInput)).id })),
  saveAllowance: action({ id: given<string | null>(), input: given<expenses.AllowanceInput>() }, async ({ id, input }, { member }): Promise<{ id: string }> => ({ id: (await expenses.saveAllowance(db(), member, id, (input ?? {}) as expenses.AllowanceInput)).id })),
  removeExpense: action({ id: given<string>() }, async ({ id }, { member }): Promise<null> => {
    const sql = db();
    await expenses.remove(sql, member, id);
    await tell.settleCardReceipts(sql, [member.id]);
    await tell.refresh(sql, [member.id]);
    return null;
  }),
  restoreExpense: action({ id: given<string>() }, async ({ id }, { member }): Promise<null> => {
    const sql = db();
    await expenses.restore(sql, member, id);
    await tell.refresh(sql, [member.id]);
    return null;
  }),
  // Sends drafts; answers how many and to whom, in the sender's words —
  // null when nobody may approve them yet (an accountant alone, nobody named).
  sendExpenses: action({ ids: given<string[]>() }, async ({ ids }, { member }): Promise<{ count: number; to: string | null }> => {
    const sql = db();
    const sent = await expenses.submit(sql, member, ids, mayApprove);
    await tell.sent(sql, member, sent);
    const locale = localeOf(member.language);
    const to = sent.approver ? nameOf((await people([sent.approver])).get(sent.approver), locale)
      : (await approversFor(sql, member.id)).length > 0 ? catalogue(locale).people.accountants : null;
    return { count: sent.expenses.length, to };
  }),

  // ---- Approving.
  decideExpenses: action({ ids: given<string[]>(), verdict: given<"approve" | "refuse">(), reason: maybe<string>() }, async ({ ids, verdict, reason }, { member }): Promise<{ count: number; owner: string }> => {
    const sql = db();
    const why = typeof reason === "string" ? reason : undefined;
    const decisions = await expenses.decide(sql, member, ids, verdict as "approve" | "refuse", why);
    await tell.decided(sql, member, decisions, verdict as "approve" | "refuse", why ?? "");
    const owner = decisions[0]?.owner ?? "";
    const locale = localeOf(member.language);
    return { count: decisions.reduce((n, d) => n + d.expenses.length, 0), owner: nameOf((await people([owner])).get(owner), locale) };
  }),

  // ---- Paying back (accountants).
  markPaid: action({ ids: given<string[]>(), paidOn: given<string>() }, async ({ ids, paidOn }, { member }): Promise<null> => {
    const sql = db();
    const done = await expenses.markPaid(sql, member, ids, paidOn);
    await tell.paid(sql, member, done, String(paidOn));
    return null;
  }),
  unmarkPaid: action({ ids: given<string[]>() }, async ({ ids }, { member }): Promise<null> => {
    const sql = db();
    await tell.unpaid(sql, await expenses.unmarkPaid(sql, member, ids));
    return null;
  }),
  // One transfer file for everyone to pay back who has bank details; the
  // browser then downloads it (/chest/pay/files/<id>).
  makeTransferFile: action({ executionDate: given<string>() }, async ({ executionDate }, { member }): Promise<{ id: string; count: number; total: number; skipped: number }> => {
    const sql = db();
    const made = await payments.createRun(sql, member, { executionDate });
    await tell.paid(sql, member, made.decisions, made.run.executionDate);
    return { id: made.run.id, count: made.run.count, total: made.run.total, skipped: made.skipped.length };
  }),
  cancelTransferFile: action({ id: given<string>() }, async ({ id }, { member }): Promise<null> => {
    const sql = db();
    await tell.unpaid(sql, await payments.cancelRun(sql, member, id));
    return null;
  }),

  // ---- Bank details: the actor's own ("me"), a person's (accountants), the
  // company's ("company"). Answers what the page shows: the masked account.
  saveBank: action({ owner: given<string>(), input: given<bank.BankInput>() }, async ({ owner, input }, { member }): Promise<{ masked: string }> => {
    const target = owner === "me" ? member.id : owner;
    const saved = await bank.setBankDetails(db(), member, target, (input ?? {}) as bank.BankInput);
    await tell.bankChanged(member, String(target), saved.masked.slice(-4));
    return { masked: saved.masked };
  }),
  removeBank: action({ owner: given<string>() }, async ({ owner }, { member }): Promise<null> => {
    await bank.removeBankDetails(db(), member, owner === "me" ? member.id : owner);
    return null;
  }),

  // ---- One's vehicle (car trips).
  setVehicle: action({ kind: given<string>(), power: given<string>(), electric: given<boolean>() }, async (input, { member }): Promise<null> => {
    await settings.setVehicle(db(), member, input);
    return null;
  }),
  // The registration certificate of the actor's vehicle (an upload of
  // theirs), or null to take it off.
  setVehicleProof: action({ object: given<string | null>(), name: maybe<string>() }, async ({ object, name }, { member }): Promise<null> => {
    const sql = db();
    const file = object === null || object === undefined ? null : await inspect(sql, member, object);
    const dropped = await settings.setVehicleProof(sql, member, file, name);
    if (dropped && dropped !== object) await forget([dropped]);
    return null;
  }),
  checkVehicle: action({ member: given<string>(), checked: given<boolean>() }, async ({ member: owner, checked }, { member }): Promise<null> => {
    await settings.checkVehicle(db(), member, owner, checked);
    return null;
  }),
  setPriorDistance: action({ year: given<number>(), distance: given<string>() }, async (input, { member }): Promise<null> => {
    await expenses.setPriorDistance(db(), member, input);
    return null;
  }),

  // ---- The company (accountants).
  updateCompany: action({ input: given<{ currency?: string; reminder?: boolean; setupDone?: boolean; journal?: Partial<settings.Journal>; payer?: string; bankLocale?: string }>() }, async ({ input }, { member }): Promise<null> => {
    await settings.updateSettings(db(), member, (input ?? {}) as settings.SettingsInput);
    return null;
  }),
  addCategory: action({ input: given<{ name: string; account?: string; vatRecovery?: number; cap?: string | null }>() }, async ({ input }, { member }): Promise<{ id: string }> => ({ id: (await settings.addCategory(db(), member, (input ?? {}) as Parameters<typeof settings.addCategory>[2])).id })),
  updateCategory: action({ id: given<string>(), input: given<{ name?: string; account?: string; vatRecovery?: number; cap?: string | null; archived?: boolean; guests?: boolean; perNight?: boolean }>() }, async ({ id, input }, { member }): Promise<null> => {
    await settings.updateCategory(db(), member, id, (input ?? {}) as Parameters<typeof settings.updateCategory>[3]);
    return null;
  }),
  addCardRule: action({ words: given<string>(), categoryId: given<string>() }, async ({ words, categoryId }, { member }): Promise<null> => {
    await settings.addCardRule(db(), member, words, categoryId);
    return null;
  }),
  removeCardRule: action({ id: given<string>() }, async ({ id }, { member }): Promise<null> => {
    await settings.removeCardRule(db(), member, id);
    return null;
  }),
  setApprover: action({ member: given<string>(), approver: given<string | null>() }, async ({ member: person, approver }, { member }): Promise<{ name: string }> => {
    const sql = db();
    const previous = await settings.setApprover(sql, member, person, approver, mayApprove);
    await tell.settleWaiting(sql, [String(person)]);
    const named = typeof approver === "string" && approver !== "" ? approver : null;
    await tell.refresh(sql, [String(person), ...previous, ...(named ? [named] : [])]);
    const locale = localeOf(member.language);
    return { name: named ? nameOf((await people([named])).get(named), locale) : catalogue(locale).settings.approvers.accountants };
  }),
  saveScale: action({ year: given<number>(), data: given<unknown>(), source: given<string>() }, async ({ year, data, source }, { member }): Promise<null> => {
    const sql = db();
    await settings.saveScale(sql, member, year, data, source);
    await expenses.recomputeAllTrips(sql);
    return null;
  }),
  saveAllowanceRate: action({ id: given<string | null>(), input: given<{ name?: string; amount?: string; unit?: string; account?: string; archived?: boolean }>() }, async ({ id, input }, { member }): Promise<null> => {
    await settings.saveAllowanceRate(db(), member, id, (input ?? {}) as Parameters<typeof settings.saveAllowanceRate>[3]);
    return null;
  }),
  // A company exchange rate ("" takes it off); answers how many expenses
  // not yet approved it changed.
  setRate: action({ currency: given<string>(), rate: given<string>() }, async ({ currency, rate }, { member }): Promise<{ count: number }> => ({ count: await settings.setRate(db(), member, currency, rate) })),
  setMemberAccount: action({ member: given<string>(), account: given<string>() }, async ({ member: person, account }, { member }): Promise<null> => {
    await settings.setMemberAccount(db(), member, person, account);
    return null;
  }),
  // Past expenses from the previous tool, their columns mapped in the page:
  // the people they name are found in the team by name.
  importExpenses: action({ lines: given<Record<string, string>[]>(), dateOrder: given<string>() }, async (input, { member }): Promise<Imported> =>
    importLines(db(), member, input, (await holders()).map(h => ({ id: h.id, name: h.name }))), lines),

  // ---- Company cards (accountants).
  // A statement, read and mapped in the page: each payment matched to its
  // expense, or a draft waiting for its receipt; the holders are asked for
  // the missing receipts. The card holders must be people of the tool.
  importCardStatement: action({ fileName: given<string>(), lines: given<cards.StatementLine[]>() }, async (input, { member }): Promise<Omit<cards.StatementResult, "owners">> => {
    const sql = db();
    const team = new Set((await holders()).filter(h => h.role !== null).map(h => h.id));
    const done = await cards.importStatement(sql, member, input, team);
    await tell.cardReceipts(sql, done.owners);
    const { owners: _owners, ...counts } = done;
    return counts;
  }, lines),
  undoCardStatement: action({ id: given<string>() }, async ({ id }, { member }): Promise<null> => {
    const sql = db();
    const owners = await cards.undoStatement(sql, member, id);
    await tell.settleCardReceipts(sql, owners);
    await tell.refresh(sql, owners);
    return null;
  }),
  // Asks a holder (or everyone owing some) again for their card receipts.
  remindCardReceipts: action({ member: maybe<string>() }, async ({ member: holder }, { member }): Promise<{ count: number }> => {
    if (!can(member, "pay")) fail("forbidden");
    const sql = db();
    const owed = await cards.receiptsOwed(sql, typeof holder === "string" ? [holder] : undefined);
    return { count: await tell.cardReceipts(sql, [...owed.keys()]) };
  }),
  checkCardLine: action({ id: given<string>(), checked: given<boolean>() }, async ({ id, checked }, { member }): Promise<null> => {
    await cards.checkLine(db(), member, id, checked);
    return null;
  }),
};
