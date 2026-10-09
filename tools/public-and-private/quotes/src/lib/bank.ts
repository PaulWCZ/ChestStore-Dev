import { createHash } from "node:crypto";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "../shared/app-error.ts";
import { checkBankMapping, linesOf, readStatement, type BankLine, type BankProblem } from "../shared/bank-parse.ts";
import type { Query, Sql } from "./db.ts";
import { receivables, type ListRow } from "./documents.ts";
import { key } from "../shared/fold.ts";
import { day, limits } from "../shared/model.ts";
import { addPayment } from "./payments.ts";

// Matching a bank statement to the invoices still to collect (Axonaut's
// weekly screen, within what the Chest allows: a file the person exports
// from their bank, no connection to the bank).
//
// Each payment received (a line with money in) is matched to an open
// invoice — issued here or imported from the previous tool — by what the
// line says: the invoice's number in its words (the surest), else the same
// amount as what is left to pay from a client whose name is in the words,
// else the only open invoice of exactly that amount, else the only open
// invoice of a client named in the words (a part of it). Nothing is
// recorded by itself: the person confirms each match in one tap (or picks
// the invoice); the payment is recorded by bank transfer, on the line's day,
// with its words as the note, and remembers the line — the same statement
// read again does not offer it twice. Undone like any payment.

export type Reason = "number" | "amount_client" | "amount" | "client";
export type Match = { invoiceId: string; number: string; client: string; due: number; reason: Reason };
export type Proposal = BankLine & { key: string; match: Match | null };
export type Reading = { proposals: Proposal[]; recorded: number; outgoing: number; problems: BankProblem[]; open: { id: string; number: string; client: string; due: number }[] };

// The line's fingerprint: its day, amount, words and place among identical
// lines. Kept with the payment it became.
export const lineKey = (l: Pick<BankLine, "date" | "amount" | "label" | "reference" | "occurrence">): string =>
  createHash("sha256").update([l.date, l.amount, l.label, l.reference, l.occurrence].join("\u0000")).digest("hex").slice(0, 40);

const legalForms = new Set(["sarl", "sas", "sasu", "eurl", "sa", "sci", "snc", "scop", "ei", "eirl", "ltd", "gmbh", "sprl", "srl", "et", "cie", "de", "la", "le", "les", "du", "des"]);

// The words of a client's name that say it (without its legal form): at
// least one of four letters or more.
function nameKeys(name: string): string[] {
  return name.split(/\s+/u).map(w => key(w)).filter(w => w.length >= 4 && !legalForms.has(w));
}

export function proposeFor(line: Pick<BankLine, "amount" | "label" | "reference">, open: readonly Pick<ListRow, "id" | "number" | "clientName" | "due">[]): Match | null {
  if (line.amount <= 0) return null;
  const words = key(`${line.label} ${line.reference}`);
  const fits = open.filter(r => r.due >= line.amount);
  const shape = (r: (typeof open)[number], reason: Reason): Match => ({ invoiceId: r.id, number: r.number ?? "", client: r.clientName, due: r.due, reason });
  // Its number, written in the words ("F-2026-0042", "F20260042").
  const byNumber = fits.filter(r => { const k = key(r.number ?? ""); return k.length >= 5 && /\d/u.test(k) && words.includes(k); });
  if (byNumber.length > 0) return shape(byNumber.find(r => r.due === line.amount) ?? byNumber[0]!, "number");
  const named = (r: (typeof open)[number]) => nameKeys(r.clientName).some(k => words.includes(k));
  const exact = fits.filter(r => r.due === line.amount);
  const exactNamed = exact.filter(named);
  if (exactNamed.length > 0) return shape(exactNamed[0]!, "amount_client");
  if (exact.length === 1) return shape(exact[0]!, "amount");
  const clients = new Set(fits.filter(named).map(r => r.clientName));
  if (clients.size === 1) {
    const theirs = fits.filter(named);
    if (theirs.length === 1) return shape(theirs[0]!, "client");
  }
  return null;
}

// readBank reads a statement (the text, the columns chosen) against the
// invoices still to collect: the lines of money in not recorded yet, each
// with its match; how many were recorded already, how many are money out.
export async function readBank(sql: Query, actor: Member | null, text: unknown, mapping: unknown, today: string, currency: string): Promise<Reading> {
  if (!can(actor, "payments")) throw new AppError("forbidden");
  const statement = readStatement(typeof text === "string" ? text : "");
  const { lines, problems } = linesOf(statement, checkBankMapping(statement.head, mapping), currency);
  const incoming = lines.filter(l => l.amount > 0);
  const keyed = incoming.map(l => ({ ...l, key: lineKey(l) }));
  const done = new Set((await sql<{ bank_line: string }[]>`
    select bank_line from payments where bank_line = any(${keyed.map(l => l.key)}::text[]) and deleted_at is null`).map(r => r.bank_line));
  const open = (await receivables(sql, actor, today)).filter(r => r.currency === currency);
  // What is left of each invoice as the lines above take their part.
  const left = new Map(open.map(r => [r.id, r.due]));
  const proposals: Proposal[] = [];
  for (const l of keyed.filter(l => !done.has(l.key)).sort((a, b) => a.date.localeCompare(b.date) || a.line - b.line)) {
    const now = open.map(r => ({ ...r, due: left.get(r.id) ?? 0 })).filter(r => r.due > 0);
    const match = proposeFor(l, now);
    if (match) left.set(match.invoiceId, (left.get(match.invoiceId) ?? 0) - l.amount);
    proposals.push({ ...l, match });
  }
  return {
    proposals,
    recorded: keyed.length - proposals.length,
    outgoing: lines.length - incoming.length,
    problems,
    open: open.map(r => ({ id: r.id, number: r.number ?? "", client: r.clientName, due: r.due })),
  };
}

export type BankPaymentInput = { key?: unknown; invoiceId?: unknown; date?: unknown; amount?: unknown; label?: unknown };

// recordBankLine records the payment a line of the statement is: on the
// invoice chosen, by transfer, on the line's day, its words as the note.
// Refused when the line was recorded already (and not deleted since).
export async function recordBankLine(sql: Sql, actor: Member | null, input: BankPaymentInput, today: string): Promise<{ id: string; due: number }> {
  if (!can(actor, "payments")) throw new AppError("forbidden");
  if (!input || typeof input !== "object") throw new AppError("invalid");
  if (typeof input.key !== "string" || !/^[0-9a-f]{40}$/u.test(input.key)) throw new AppError("invalid");
  const amount = input.amount;
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0 || amount > limits.total) throw new AppError("payment_invalid");
  const paidOn = day(input.date);
  const [used] = await sql`select 1 from payments where bank_line = ${input.key} and deleted_at is null`;
  if (used) throw new AppError("bank_line_used");
  const note = typeof input.label === "string" ? input.label.slice(0, 200) : "";
  const done = await addPayment(sql, actor, input.invoiceId, { paidOn, amount, method: "transfer", note }, today);
  await sql`update payments set bank_line = ${input.key} where id = ${done.id}`;
  return done;
}
