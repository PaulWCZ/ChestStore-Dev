"use server";

import { chest } from "@argentic/chest-sdk/chest";
import type { Member } from "@argentic/chest-sdk/member";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { can } from "../../lib/access.ts";
import { keep, draw } from "../../lib/archive.ts";
import * as bank from "../../lib/bank.ts";
import * as clients from "../../lib/clients.ts";
import * as company from "../../lib/company.ts";
import { db } from "../../lib/db.ts";
import * as documents from "../../lib/documents.ts";
import { attempt, AppError, type Result } from "../../lib/errors.ts";
import { catalogue, isLocale, type Locale } from "../../lib/i18n/index.ts";
import * as importers from "../../lib/importers.ts";
import * as items from "../../lib/items.ts";
import { checkLogo } from "../../lib/logo.ts";
import * as payments from "../../lib/payments.ts";
import * as sending from "../../lib/sending.ts";
import { currentMember } from "../../lib/session.ts";
import * as numbering from "../../lib/numbering.ts";
import * as online from "../../lib/online.ts";
import { publicOrigin } from "../../lib/public-origin.ts";
import { settledLate } from "../../lib/reminders.ts";
import * as registry from "../../lib/registry.ts";
import * as repeats from "../../lib/repeats.ts";
import * as terms from "../../lib/terms.ts";
import * as timesheets from "../../lib/timesheets.ts";
import * as versions from "../../lib/versions.ts";
import { versioned } from "../../lib/model.ts";
import { readyForBilling, refreshBadges, settled } from "../../lib/tell.ts";

// The server actions of the members' part. Each is an endpoint anyone can
// call: each reads the member from the Chest's assertion again; the
// services check their rights. They answer codes, never sentences, and
// refresh the pages of /chest. The day is always the Chest's (chest.today()).

async function act<T>(step: (actor: Member) => Promise<T>): Promise<Result<T>> {
  const result = await attempt(async () => {
    const actor = await currentMember();
    if (!actor) throw new AppError("forbidden");
    return step(actor);
  });
  revalidatePath("/chest", "layout");
  return result;
}

const defaults = (): documents.Defaults => {
  const locale = chest.language;
  return { today: chest.today(), locale: isLocale(locale) ? (locale as Locale) : "en", currency: chest.currency };
};

// --- Documents ----------------------------------------------------------------

export async function createDocument(type: "quote" | "invoice", clientId: string | null): Promise<Result<{ id: string }>> {
  return act(async actor => ({ id: (await documents.createDocument(db(), actor, type, clientId, defaults())).id }));
}

export type Saved = Pick<documents.Doc, "net" | "vat" | "gross" | "rates" | "language" | "vatTreatment" | "franchise" | "clientId" | "updatedAt">;

export async function saveDraft(id: string, input: documents.DraftInput): Promise<Result<Saved>> {
  const result = await attempt(async () => {
    const actor = await currentMember();
    const d = await documents.saveDraft(db(), actor, id, input);
    return { net: d.net, vat: d.vat, gross: d.gross, rates: d.rates, language: d.language, vatTreatment: d.vatTreatment, franchise: d.franchise, clientId: d.clientId, updatedAt: d.updatedAt };
  });
  // The editor keeps its own state: only the lists need refreshing, and they
  // re-read on their next visit.
  return result;
}

export async function removeDraft(id: string): Promise<Result> {
  return act(async actor => {
    const d = await documents.removeDraft(db(), actor, id);
    if (d.readyAt) await settled(d.id);
    await refreshBadges(db(), chest.today());
    return null;
  });
}

export async function restoreDraft(id: string): Promise<Result> {
  return act(async actor => { await documents.restoreDraft(db(), actor, id); await refreshBadges(db(), chest.today()); return null; });
}

export async function duplicate(id: string): Promise<Result<{ id: string }>> {
  return act(async actor => ({ id: (await documents.duplicate(db(), actor, id, defaults())).id }));
}

export async function decide(id: string, decision: "accepted" | "refused" | "sent"): Promise<Result> {
  return act(async actor => { await documents.decideQuote(db(), actor, id, decision); return null; });
}

export async function invoiceFromQuote(id: string, deposit: number | null): Promise<Result<{ id: string }>> {
  return act(async actor => ({ id: (await documents.invoiceFromQuote(db(), actor, id, deposit)).id }));
}

export async function markReady(id: string): Promise<Result> {
  return act(async actor => {
    const sql = db();
    const d = await documents.markReady(sql, actor, id);
    const [client] = d.clientId ? await sql<{ name: string }[]>`select name from clients where id = ${d.clientId}` : [];
    await readyForBilling(actor, d, client?.name ?? "");
    await refreshBadges(sql, chest.today());
    return null;
  });
}

// finalise numbers and freezes; the PDF is drawn and kept at once (the
// copy of record), or at its first download if the Chest cannot take it now.
export async function finalise(id: string): Promise<Result<{ number: string }>> {
  return act(async actor => {
    const sql = db();
    const today = chest.today();
    const d = await documents.finalise(sql, actor, id, today);
    await settled(d.id);
    // Made from time handed over by Timesheets: it hears the invoice is issued.
    await timesheets.invoicedHandoff(sql, d.id, actor.id);
    if (d.type === "credit" && d.invoiceId) await settledLate(d.invoiceId);
    try {
      const full = await documents.getDocument(sql, actor, d.id, today);
      await keep(sql, full, await draw(sql, full, today));
    } catch (error) {
      console.error("pdf not kept yet", error instanceof Error ? error.name : "error");
    }
    await refreshBadges(sql, today);
    return { number: d.number ?? "" };
  });
}

export async function startCreditNote(invoiceId: string): Promise<Result<{ id: string }>> {
  return act(async actor => ({ id: (await documents.startCreditNote(db(), actor, invoiceId)).id }));
}

// --- Sending --------------------------------------------------------------------

export async function send(id: string, message: sending.Message & { upcoming?: string }): Promise<Result<{ delivery: sending.Delivery; number: string | null }>> {
  return act(async actor => sending.sendDocument(db(), actor, id, message, chest.today(), { origin: publicOrigin(await headers()) }));
}

// The quote's link to answer online: turned off for good, or a new one
// (the old one stops working).
export async function revokeLink(id: string): Promise<Result> {
  return act(async actor => { await online.revokeLink(db(), actor, id); return null; });
}

export async function renewLink(id: string): Promise<Result<{ url: string | null }>> {
  return act(async actor => {
    const link = await online.renewLink(db(), actor, id);
    const origin = publicOrigin(await headers());
    return { url: origin ? `${origin}/q/${link.secret}` : null };
  });
}

// The message the send (or reminder) dialog starts from, written for the
// document as it is now, in its client's language. A quote's email opens
// with its answer line (`line`, shown fixed in the dialog): its link when
// the quote has one, else the words saying it is made when the email goes.
export async function messageFor(id: string, kind: sending.Kind): Promise<Result<sending.Message & { upcoming?: string; line?: string; terms?: boolean }>> {
  return attempt(async () => {
    const actor = await currentMember();
    const sql = db();
    const today = chest.today();
    const full = await documents.getDocument(sql, actor, id, today);
    const c = await company.company(sql);
    const upcoming = full.number === null ? await documents.upcomingNumber(sql, full.type, today) : undefined;
    const before = full.type === "quote" && full.version > 1 ? (await versions.versionsOf(sql, actor, full.id))[0] ?? null : null;
    const message = sending.draftMessage(full, kind, { company: company.goesBy(c), sender: actor?.name ?? "", iban: c.iban, bic: c.bic, today, paymentLink: c.paymentLink ?? "", replaces: before?.issueDate ?? null, ...(upcoming ? { upcoming } : {}) });
    let line: string | undefined;
    if (full.type === "quote" && kind === "send") {
      const link = await online.liveLink(sql, full.id);
      const origin = publicOrigin(await headers());
      const number = versioned(full.number, full.version) ?? upcoming ?? "";
      line = sending.answerLine(full.language, number, link && origin ? `${origin}/q/${link.secret}` : catalogue(full.language).mail.linkToCome);
    }
    // A quote carries the terms and conditions of sale, when there are some.
    return { ...message, ...(upcoming ? { upcoming } : {}), ...(line ? { line } : {}), ...(line && c.terms ? { terms: true } : {}) };
  });
}

// --- Versions of a sent quote ------------------------------------------------------

// A sent quote is changed through its next version: the version sent is
// kept; the quote is a draft again under its number (lib/versions.ts).
export async function reviseQuote(id: string): Promise<Result<{ version: number }>> {
  return act(async actor => ({ version: (await versions.reviseQuote(db(), actor, id, chest.today())).version }));
}

// The next version not sent yet, dropped: the quote is the version sent.
export async function discardVersion(id: string): Promise<Result<{ version: number }>> {
  return act(async actor => ({ version: (await versions.discardVersion(db(), actor, id)).version }));
}

export async function markSent(id: string): Promise<Result<{ number: string | null }>> {
  return act(async actor => sending.markSent(db(), actor, id, chest.today()));
}

export async function remind(id: string, message: sending.Message): Promise<Result<{ delivery: sending.Delivery }>> {
  return act(async actor => sending.sendReminder(db(), actor, id, message, chest.today()));
}

export async function markReminded(id: string): Promise<Result> {
  return act(async actor => { await sending.markReminded(db(), actor, id); return null; });
}

// --- Payments -------------------------------------------------------------------

export async function addPayment(id: string, input: payments.PaymentInput): Promise<Result<{ id: string; due: number }>> {
  return act(async actor => {
    const done = await payments.addPayment(db(), actor, id, input, chest.today());
    if (done.due <= 0) await settledLate(id);
    await refreshBadges(db(), chest.today());
    return done;
  });
}

export async function removePayment(paymentId: string): Promise<Result> {
  return act(async actor => { await payments.removePayment(db(), actor, paymentId); await refreshBadges(db(), chest.today()); return null; });
}

export async function restorePayment(paymentId: string): Promise<Result> {
  return act(async actor => { await payments.restorePayment(db(), actor, paymentId); await refreshBadges(db(), chest.today()); return null; });
}

// --- A bank statement ---------------------------------------------------------------

// readBank reads the statement's text (the columns chosen) against the
// invoices still to collect: each payment received with its match.
export async function readBank(text: string, mapping: string[]): Promise<Result<bank.Reading>> {
  return attempt(async () => bank.readBank(db(), await currentMember(), text, mapping, chest.today(), chest.currency));
}

// recordBank records a line of the statement as the payment of an invoice.
export async function recordBank(input: bank.BankPaymentInput): Promise<Result<{ id: string; due: number }>> {
  return act(async actor => {
    const done = await bank.recordBankLine(db(), actor, input, chest.today());
    if (done.due <= 0) await settledLate(String(input.invoiceId));
    await refreshBadges(db(), chest.today());
    return done;
  });
}

// --- Clients and the catalogue ------------------------------------------------------

// A company's details from its SIREN, through the public directory
// (lib/registry.ts: the tool's one declared network host).
export async function lookupCompany(siren: string): Promise<Result<registry.Registered>> {
  return attempt(async () => registry.lookupSiren(await currentMember(), siren));
}

export async function addClient(input: clients.ClientInput): Promise<Result<clients.Client>> {
  return act(async actor => clients.addClient(db(), actor, input));
}

export async function updateClient(id: string, input: clients.ClientInput): Promise<Result<clients.Client>> {
  return act(async actor => clients.updateClient(db(), actor, id, input));
}

export async function archiveClient(id: string, archived: boolean): Promise<Result> {
  return act(async actor => { await clients.archiveClient(db(), actor, id, archived); return null; });
}

export async function addItem(input: items.ItemInput): Promise<Result<items.Item>> {
  return act(async actor => items.addItem(db(), actor, input, chest.currency));
}

export async function updateItem(id: string, input: items.ItemInput): Promise<Result<items.Item>> {
  return act(async actor => items.updateItem(db(), actor, id, input, chest.currency));
}

export async function archiveItem(id: string, archived: boolean): Promise<Result> {
  return act(async actor => { await items.archiveItem(db(), actor, id, archived); return null; });
}

// importFile brings the rows of a spreadsheet into the clients or the
// catalogue; the file is read again on the server.
export async function importFile(kind: string, text: string, mapping: (string | null)[]): Promise<Result<importers.ImportReport>> {
  return act(async actor => {
    const locale = chest.language;
    const report = await importers.importTable(db(), actor, kind, text, mapping, { currency: chest.currency, defaultLanguage: isLocale(locale) ? locale : "en", today: chest.today() });
    // Imported invoices may be overdue already: billing's count follows.
    if (kind === "invoices" && report.created > 0) await refreshBadges(db(), chest.today());
    return report;
  });
}

// An import of invoices taken back (while nothing was recorded on them).
export async function undoImport(batch: string): Promise<Result<{ removed: number }>> {
  return act(async actor => {
    const done = await importers.undoImport(db(), actor, batch);
    await refreshBadges(db(), chest.today());
    return done;
  });
}

// --- Settings --------------------------------------------------------------------

export async function updateCompany(input: company.CompanyInput): Promise<Result<{ missing: string[] }>> {
  return act(async actor => ({ missing: company.missing(await company.updateCompany(db(), actor, input)) }));
}

// Numbering: go on from the previous tool's last number, or number without
// the year. Both are kept in the numbering's history.
export async function continueSequence(type: string, next: string): Promise<Result<{ next: string }>> {
  return act(async actor => ({ next: (await numbering.continueSequence(db(), actor, type, next, chest.today())).next }));
}

export async function setNumberFormat(format: string): Promise<Result> {
  return act(async actor => { await numbering.setNumberFormat(db(), actor, format); return null; });
}

// --- Recurring invoices -------------------------------------------------------------

export async function repeatInvoice(id: string, every: string, startsOn: string | null): Promise<Result<{ nextOn: string }>> {
  return act(async actor => ({ nextOn: (await repeats.repeatInvoice(db(), actor, id, every, startsOn, chest.today())).nextOn }));
}

export async function stopRepeat(repeatId: string): Promise<Result> {
  return act(async actor => { await repeats.stopRepeat(db(), actor, repeatId); return null; });
}

export async function saveLogo(object: string): Promise<Result> {
  return act(async actor => {
    const logo = await checkLogo(actor, object);
    await company.setLogo(db(), actor, logo.object, logo.type);
    return null;
  });
}

// The terms and conditions of sale: the PDF that arrived is checked and
// kept; removed, quotes go without them.
export async function saveTerms(object: string, name: string): Promise<Result> {
  return act(async actor => { await terms.saveTerms(db(), actor, object, name); return null; });
}

export async function removeTerms(): Promise<Result> {
  return act(async actor => { await terms.removeTerms(db(), actor); return null; });
}

export async function removeLogo(): Promise<Result> {
  return act(async actor => {
    if (!can(actor, "settings")) throw new AppError("forbidden");
    await company.setLogo(db(), actor, null, null);
    return null;
  });
}
