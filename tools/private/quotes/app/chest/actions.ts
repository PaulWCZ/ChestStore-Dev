"use server";

import * as chest from "@argentic/chest-sdk/chest";
import type { Member } from "@argentic/chest-sdk/member";
import { revalidatePath } from "next/cache";
import { can } from "../../lib/access.ts";
import { keep, draw } from "../../lib/archive.ts";
import * as clients from "../../lib/clients.ts";
import * as company from "../../lib/company.ts";
import { db } from "../../lib/db.ts";
import * as documents from "../../lib/documents.ts";
import { attempt, AppError, type Result } from "../../lib/errors.ts";
import { isLocale, type Locale } from "../../lib/i18n/index.ts";
import * as items from "../../lib/items.ts";
import { checkLogo } from "../../lib/logo.ts";
import * as payments from "../../lib/payments.ts";
import * as sending from "../../lib/sending.ts";
import { currentMember } from "../../lib/session.ts";
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
  const locale = chest.locale();
  return { today: chest.today(), locale: isLocale(locale) ? (locale as Locale) : "en", currency: chest.currency() };
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
  return act(async actor => sending.sendDocument(db(), actor, id, message, chest.today()));
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

// --- Clients and the catalogue ------------------------------------------------------

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
  return act(async actor => items.addItem(db(), actor, input, chest.currency()));
}

export async function updateItem(id: string, input: items.ItemInput): Promise<Result<items.Item>> {
  return act(async actor => items.updateItem(db(), actor, id, input, chest.currency()));
}

export async function archiveItem(id: string, archived: boolean): Promise<Result> {
  return act(async actor => { await items.archiveItem(db(), actor, id, archived); return null; });
}

// --- Settings --------------------------------------------------------------------

export async function updateCompany(input: company.CompanyInput): Promise<Result<{ missing: string[] }>> {
  return act(async actor => ({ missing: company.missing(await company.updateCompany(db(), actor, input)) }));
}

export async function saveLogo(object: string): Promise<Result> {
  return act(async actor => {
    const logo = await checkLogo(actor, object);
    await company.setLogo(db(), actor, logo.object, logo.type);
    return null;
  });
}

export async function removeLogo(): Promise<Result> {
  return act(async actor => {
    if (!can(actor, "settings")) throw new AppError("forbidden");
    await company.setLogo(db(), actor, null, null);
    return null;
  });
}
