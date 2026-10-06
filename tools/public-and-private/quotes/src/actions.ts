import { chest } from "@argentic/chest-sdk/chest";
import * as visitors from "@argentic/chest-sdk/visitors";
import { action, after, fail, field, publicAction, redirect, type Field } from "@argentic/chest-app";
import { countryName, localeOf, locales, words } from "./i18n/index.ts";
import type { ClientOption, ItemOption } from "./lib/views.ts";
import { can } from "./lib/access.ts";
import { draw, keep } from "./lib/archive.ts";
import * as bank from "./lib/bank.ts";
import { bankLimits } from "./shared/bank-parse.ts";
import * as clients from "./lib/clients.ts";
import * as company from "./lib/company.ts";
import { db } from "./lib/db.ts";
import * as documents from "./lib/documents.ts";
import * as importers from "./lib/importers.ts";
import * as items from "./lib/items.ts";
import { checkLogo, grantLogo } from "./lib/logo.ts";
import { clientKinds, documentTypes, limits, numberFormats, paymentMethods, versioned } from "./shared/model.ts";
import * as numbering from "./lib/numbering.ts";
import * as online from "./lib/online.ts";
import { importKinds, importLimits } from "./shared/parse-import.ts";
import * as payments from "./lib/payments.ts";
import { answerUrl, publicOrigin } from "./lib/public-origin.ts";
import { settledLate } from "./lib/reminders.ts";
import * as registry from "./lib/registry.ts";
import * as repeats from "./lib/repeats.ts";
import * as sending from "./lib/sending.ts";
import { answeredOnline, readyForBilling, refreshBadges, settled } from "./lib/tell.ts";
import * as terms from "./lib/terms.ts";
import * as timesheets from "./lib/timesheets.ts";
import * as versions from "./lib/versions.ts";

// Every change of Quotes, by name. action(): the team's (POST
// /chest/actions/<name>), the member read from the Chest's assertion on
// each call; publicAction(): the public part's one action — a client
// answering a quote from its link (POST /actions/answerQuote), bounded.
// From an island: call("finalise", { id }); the page refreshes after each
// (unless the island says otherwise). The rules are in src/lib/: who may
// do what is checked there, from `member` — never from the input —, every
// value is checked again there, and a refusal is a code (src/i18n,
// errors) the reader sees in their words. The day is always the Chest's
// (chest.today()), the currency the Chest's (chest.currency).

const id = field.id();
// What a person typed, as it was sent (a string, or a number an island
// sent as one): the rules clean, bound and read it themselves — lines kept
// where a text may have several (an address, notes), an amount read in the
// currency of the document or of the Chest. field.money() is not used for
// amounts: it reads cents, and Quotes' currency may have no decimals (JPY)
// or three (KWD) — src/lib/money.ts, parseAmount.
const typed = (max: number): Field<string, string | number> => ({
  read: value => (value === undefined || value === null ? "" : typeof value === "string" ? (value.length > max * 4 ? fail("too_long", { max }) : value) : typeof value === "number" && Number.isFinite(value) ? String(value) : fail("invalid")),
});
// An amount typed ("1 234,50", "12.5"), read by the rule in its currency.
const amount = typed(40);
const today = () => chest.today();
const defaults = (): documents.Defaults => ({ today: today(), locale: localeOf(chest.language), currency: chest.currency });

// A client's card, as its form sends it.
const clientFields = {
  kind: field.choice(clientKinds), name: typed(limits.name), contact: typed(limits.contact), email: typed(limits.email), phone: typed(limits.phone),
  address: typed(limits.address), postcode: typed(limits.postcode), city: typed(limits.city), country: typed(8), deliveryAddress: typed(limits.address),
  siren: typed(20), vatNumber: typed(20), language: field.choice(locales), reverseCharge: field.bool(), notes: typed(limits.notes), account: typed(20),
};
// An item of the catalogue, as its form sends it.
const itemFields = { name: typed(limits.name), description: typed(limits.description), unit: typed(limits.unit), unitPrice: amount, vatRate: field.int({ min: 0, max: 10_000 }), goods: field.bool() };
// The company's details, as Settings sends them (every field at once).
const companyFields = {
  legalName: typed(limits.name), tradeName: typed(limits.name), legalForm: typed(60), capital: amount, address: typed(limits.address), postcode: typed(limits.postcode),
  city: typed(limits.city), country: typed(8), siren: typed(20), siret: typed(24), rcsCity: typed(limits.city), vatNumber: typed(20), franchise: field.bool(),
  vatOnDebits: field.bool(), email: typed(limits.email), phone: typed(limits.phone), website: typed(120), bank: typed(limits.name), iban: typed(42), bic: typed(11),
  paymentDays: typed(8), validityDays: typed(8), penaltyRate: typed(12), earlyDiscount: typed(limits.terms), footer: typed(limits.terms), quotePrefix: typed(limits.prefix),
  invoicePrefix: typed(limits.prefix), creditPrefix: typed(limits.prefix), paymentLink: typed(300), remindersOn: field.bool(), reminderDays: typed(40),
  remindersEmail: field.bool(), accounts: field.json(),
};
// A file the browser sends to the Chest's files (a logo, the terms): what
// it says it is, before it is granted.
const upload = { type: field.text({ max: 100 }), size: field.int({ min: 1, max: 1 << 30 }) };

// A change that may make an invoice paid, or overdue no longer: billing's
// count on the tile, after the answer (a Chest that does not answer never
// fails what was written).
const recount = () => after("badges", () => refreshBadges(db(), today()));

export const actions = {
  // ——— Documents ———

  createDocument: action({ type: field.choice(["quote", "invoice"] as const), clientId: field.optional(id) }, async ({ type, clientId }, { member }): Promise<{ id: string }> =>
    ({ id: (await documents.createDocument(db(), member, type, clientId ?? null, defaults())).id })),

  // The paper's autosave: the header's fields given, and all the lines
  // (an island's object, checked by documents.checkLines).
  saveDraft: action({ id, draft: field.json() }, async ({ id: docId, draft }, { member }): Promise<Saved> => {
    const d = await documents.saveDraft(db(), member, docId, draft as documents.DraftInput);
    return { net: d.net, vat: d.vat, gross: d.gross, rates: d.rates, language: d.language, vatTreatment: d.vatTreatment, franchise: d.franchise, clientId: d.clientId, updatedAt: d.updatedAt };
  }),

  removeDraft: action({ id }, async ({ id: docId }, { member }): Promise<null> => {
    const d = await documents.removeDraft(db(), member, docId);
    if (d.readyAt) after("bell", () => settled(d.id));
    recount();
    return null;
  }),

  restoreDraft: action({ id }, async ({ id: docId }, { member }): Promise<null> => {
    await documents.restoreDraft(db(), member, docId);
    recount();
    return null;
  }),

  duplicate: action({ id }, async ({ id: docId }, { member }): Promise<{ id: string }> => ({ id: (await documents.duplicate(db(), member, docId, defaults())).id })),

  decide: action({ id, decision: field.choice(["accepted", "refused", "sent"] as const) }, async ({ id: docId, decision }, { member }): Promise<null> => {
    await documents.decideQuote(db(), member, docId, decision);
    return null;
  }),

  invoiceFromQuote: action({ id, deposit: field.optional(field.int({ min: 1, max: 9_999 })) }, async ({ id: docId, deposit }, { member }): Promise<{ id: string }> =>
    ({ id: (await documents.invoiceFromQuote(db(), member, docId, deposit ?? null)).id })),

  markReady: action({ id }, async ({ id: docId }, { member }): Promise<null> => {
    const sql = db();
    const d = await documents.markReady(sql, member, docId);
    const [client] = d.clientId ? await sql<{ name: string }[]>`select name from clients where id = ${d.clientId}` : [];
    after("bell", () => readyForBilling(member, d, client?.name ?? ""));
    recount();
    return null;
  }),

  // Numbers and freezes; the PDF of record is drawn and kept at once, or
  // at its first download if the Chest cannot take it now.
  finalise: action({ id }, async ({ id: docId }, { member }): Promise<{ number: string }> => {
    const sql = db();
    const day = today();
    const d = await documents.finalise(sql, member, docId, day);
    after("bell", () => settled(d.id));
    // Made from time handed over by Timesheets: it hears the invoice is
    // issued (once; the follow-up tries again if the Chest cannot now).
    after("timesheets", async () => { await timesheets.invoicedHandoff(sql, d.id, member.id); });
    if (d.type === "credit" && d.invoiceId) after("bell", () => settledLate(d.invoiceId!));
    after("pdf of record", async () => {
      const full = await documents.getDocument(sql, member, d.id, day);
      await keep(sql, full, await draw(sql, full, day));
    });
    recount();
    return { number: d.number ?? "" };
  }),

  startCreditNote: action({ id }, async ({ id: docId }, { member }): Promise<{ id: string }> => ({ id: (await documents.startCreditNote(db(), member, docId)).id })),

  // ——— Sending ———

  send: action({ id, message: field.json() }, async ({ id: docId, message }, { member }): Promise<{ delivery: sending.Delivery; number: string | null }> =>
    sending.sendDocument(db(), member, docId, message, today(), { origin: publicOrigin() })),

  // The message the send (or reminder) dialog starts from, written for the
  // document as it is now, in its client's language. A quote's email opens
  // with its answer line (`line`, shown fixed in the dialog): its link when
  // the quote has one, else the words saying it is made when the email
  // goes. Reads only: sent beside the queue.
  messageFor: action({ id, kind: field.choice(["send", "reminder"] as const) }, async ({ id: docId, kind }, { member }): Promise<sending.Message & { upcoming?: string; line?: string; terms?: boolean }> => {
    const sql = db();
    const day = today();
    const full = await documents.getDocument(sql, member, docId, day);
    const c = await company.company(sql);
    const upcoming = full.number === null ? await documents.upcomingNumber(sql, full.type, day) : undefined;
    const before = full.type === "quote" && full.version > 1 ? (await versions.versionsOf(sql, member, full.id))[0] ?? null : null;
    const message = sending.draftMessage(full, kind, { company: company.goesBy(c), sender: member.name, iban: c.iban, bic: c.bic, today: day, paymentLink: c.paymentLink ?? "", replaces: before?.issueDate ?? null, ...(upcoming ? { upcoming } : {}) });
    let line: string | undefined;
    if (full.type === "quote" && kind === "send") {
      const link = await online.liveLink(sql, full.id);
      const number = versioned(full.number, full.version) ?? upcoming ?? "";
      line = sending.answerLine(full.language, number, (link && answerUrl(link.secret)) || words(full.language).mail.linkToCome);
    }
    // A quote carries the terms and conditions of sale, when there are some.
    return { ...message, ...(upcoming ? { upcoming } : {}), ...(line ? { line } : {}), ...(line && c.terms ? { terms: true } : {}) };
  }, { parallel: true }),

  markSent: action({ id }, async ({ id: docId }, { member }): Promise<{ number: string | null }> => sending.markSent(db(), member, docId, today())),

  remind: action({ id, message: field.json() }, async ({ id: docId, message }, { member }): Promise<{ delivery: sending.Delivery }> => sending.sendReminder(db(), member, docId, message, today())),

  markReminded: action({ id }, async ({ id: docId }, { member }): Promise<null> => {
    await sending.markReminded(db(), member, docId);
    return null;
  }),

  // The quote's link to answer online: turned off for good, or a new one
  // (the old one stops working).
  revokeLink: action({ id }, async ({ id: docId }, { member }): Promise<null> => {
    await online.revokeLink(db(), member, docId);
    return null;
  }),

  renewLink: action({ id }, async ({ id: docId }, { member }): Promise<{ url: string | null }> => ({ url: answerUrl((await online.renewLink(db(), member, docId)).secret) })),

  // ——— Versions of a sent quote ———

  // A sent quote is changed through its next version: the version sent is
  // kept; the quote is a draft again under its number (lib/versions.ts).
  reviseQuote: action({ id }, async ({ id: docId }, { member }): Promise<{ version: number }> => ({ version: (await versions.reviseQuote(db(), member, docId, today())).version })),

  // The next version not sent yet, dropped: the quote is the version sent.
  discardVersion: action({ id }, async ({ id: docId }, { member }): Promise<{ version: number }> => ({ version: (await versions.discardVersion(db(), member, docId)).version })),

  // ——— Payments ———

  addPayment: action({ id, paidOn: field.day(), amount, method: field.choice(paymentMethods), note: typed(200) }, async ({ id: docId, ...input }, { member }): Promise<{ id: string; due: number }> => {
    const done = await payments.addPayment(db(), member, docId, input, today());
    if (done.due <= 0) after("bell", () => settledLate(docId));
    recount();
    return done;
  }),

  removePayment: action({ id }, async ({ id: paymentId }, { member }): Promise<null> => {
    await payments.removePayment(db(), member, paymentId);
    recount();
    return null;
  }),

  restorePayment: action({ id }, async ({ id: paymentId }, { member }): Promise<null> => {
    await payments.restorePayment(db(), member, paymentId);
    recount();
    return null;
  }),

  // ——— A bank statement ———

  // The statement's text (the columns chosen) read against the invoices
  // still to collect: each payment received with its match. Reads only.
  readBank: action({ text: typed(bankLimits.bytes), mapping: field.json() }, async ({ text, mapping }, { member }): Promise<bank.Reading> =>
    bank.readBank(db(), member, text, mapping, today(), chest.currency), { maxBody: 3 << 20, parallel: true }),

  recordBank: action({ key: field.text({ max: 80 }), invoiceId: id, date: field.day(), amount: field.int({ min: 1, max: limits.total }), label: typed(400) }, async (input, { member }): Promise<{ id: string; due: number }> => {
    const done = await bank.recordBankLine(db(), member, input, today());
    if (done.due <= 0) after("bell", () => settledLate(input.invoiceId));
    recount();
    return done;
  }),

  // ——— Clients and the catalogue ———

  // A company's details from its SIREN, through the public directory
  // (lib/registry.ts: the tool's one declared network host). Reads only.
  lookupCompany: action({ siren: typed(20) }, async ({ siren }, { member }): Promise<registry.Registered> => registry.lookupSiren(member, siren), { parallel: true }),

  // The document's pickers ask as the dialog opens and as one types: the
  // page carries no list (studio.6 bounds an island's props). The first
  // 50 that match, by name; a client's country in the document's language.
  findClients: action({ q: field.optional(field.text({ max: 80 })), language: field.choice(locales) }, async ({ q, language }, { member }): Promise<ClientOption[]> =>
    (await clients.listClients(db(), member, { q: q ?? "", limit: 50 })).map(c => ({
      id: c.id, kind: c.kind, name: c.name, contact: c.contact, email: c.email, address: c.address, postcode: c.postcode, city: c.city, country: c.country,
      deliveryAddress: c.deliveryAddress, siren: c.siren, vatNumber: c.vatNumber, language: c.language, reverseCharge: c.reverseCharge, archived: c.archived,
      countryName: countryName(c.country, language),
    })), { parallel: true }),

  findItems: action({ q: field.optional(field.text({ max: 80 })) }, async ({ q }, { member }): Promise<ItemOption[]> =>
    (await items.listItems(db(), member, { q: q ?? "", limit: 50 })).map(i => ({ id: i.id, name: i.name, description: i.description, unit: i.unit, unitPrice: i.unitPrice, vatRate: i.vatRate, goods: i.goods })),
  { parallel: true }),

  addClient: action(clientFields, async (input, { member }): Promise<clients.Client> => clients.addClient(db(), member, input)),

  updateClient: action({ id, ...clientFields }, async ({ id: clientId, ...input }, { member }): Promise<clients.Client> => clients.updateClient(db(), member, clientId, input)),

  archiveClient: action({ id, archived: field.bool() }, async ({ id: clientId, archived }, { member }): Promise<null> => {
    await clients.archiveClient(db(), member, clientId, archived);
    return null;
  }),

  addItem: action(itemFields, async (input, { member }): Promise<items.Item> => items.addItem(db(), member, input, chest.currency)),

  updateItem: action({ id, ...itemFields }, async ({ id: itemId, ...input }, { member }): Promise<items.Item> => items.updateItem(db(), member, itemId, input, chest.currency)),

  archiveItem: action({ id, archived: field.bool() }, async ({ id: itemId, archived }, { member }): Promise<null> => {
    await items.archiveItem(db(), member, itemId, archived);
    return null;
  }),

  // The rows of a spreadsheet into the clients, the catalogue or the
  // invoices still to collect; the file is read again here. Slow: sent
  // beside the queue.
  importFile: action({ kind: field.choice(importKinds), text: typed(importLimits.bytes), mapping: field.json() }, async ({ kind, text, mapping }, { member }): Promise<importers.ImportReport> => {
    const report = await importers.importTable(db(), member, kind, text, mapping, { currency: chest.currency, defaultLanguage: localeOf(chest.language), today: today() });
    // Imported invoices may be overdue already: billing's count follows.
    if (kind === "invoices" && report.created > 0) recount();
    return report;
  }, { maxBody: 8 << 20, parallel: true }),

  // An import of invoices taken back (while nothing was recorded on them).
  undoImport: action({ batch: field.text({ max: 32 }) }, async ({ batch }, { member }): Promise<{ removed: number }> => {
    const done = await importers.undoImport(db(), member, batch);
    recount();
    return done;
  }),

  // ——— Settings ———

  updateCompany: action(companyFields, async (input, { member }): Promise<{ missing: string[] }> => ({ missing: company.missing(await company.updateCompany(db(), member, input)) })),

  // Numbering: go on from the previous tool's last number, or number
  // without the year. Both are kept in the numbering's history.
  continueSequence: action({ type: field.choice(documentTypes), next: typed(12) }, async ({ type, next }, { member }): Promise<{ next: string }> => ({ next: (await numbering.continueSequence(db(), member, type, next, today())).next })),

  setNumberFormat: action({ format: field.choice(numberFormats) }, async ({ format }, { member }): Promise<null> => {
    await numbering.setNumberFormat(db(), member, format);
    return null;
  }),

  // The logo and the terms and conditions go from the admin's browser to
  // the Chest's files: one upload granted here (its address), then the
  // file that arrived checked and kept.
  grantLogo: action(upload, async (input, { member }): Promise<{ url: string; method: string; object: string }> => grantLogo(member, input), { parallel: true }),
  saveLogo: action({ object: field.text({ max: 80 }) }, async ({ object }, { member }): Promise<null> => {
    const logo = await checkLogo(member, object);
    await company.setLogo(db(), member, logo.object, logo.type);
    return null;
  }, { parallel: true }),
  removeLogo: action({}, async (_, { member }): Promise<null> => {
    if (!can(member, "settings")) fail("forbidden");
    await company.setLogo(db(), member, null, null);
    return null;
  }),
  grantTerms: action(upload, async (input, { member }): Promise<{ url: string; method: string; object: string }> => terms.grantTerms(member, input), { parallel: true }),
  saveTerms: action({ object: field.text({ max: 80 }), name: typed(255) }, async ({ object, name }, { member }): Promise<null> => {
    await terms.saveTerms(db(), member, object, name);
    return null;
  }, { parallel: true }),
  removeTerms: action({}, async (_, { member }): Promise<null> => {
    await terms.removeTerms(db(), member);
    return null;
  }),

  // ——— Recurring invoices ———

  repeatInvoice: action({ id, every: field.choice(repeats.repeatEvery), startsOn: field.optional(field.day()) }, async ({ id: docId, every, startsOn }, { member }): Promise<{ nextOn: string }> =>
    ({ nextOn: (await repeats.repeatInvoice(db(), member, docId, every, startsOn ?? null, today())).nextOn })),

  stopRepeat: action({ id }, async ({ id: repeatId }, { member }): Promise<null> => {
    await repeats.stopRepeat(db(), member, repeatId);
    return null;
  }),

  // ——— The public part: a client answers a quote from its link ———

  // Anyone on the Internet may call it: it holds no member, touches
  // nothing but the quote the secret opens, and is bounded the package's
  // way (a form token that serves once, the honeypot, a form sent sooner
  // than 3 s waits; counted per visitor, per link and for everyone a day:
  // accepting and declining each their budget). The link is checked first
  // (a refusal costs no budget), then the answer is recorded with its proof
  // (src/lib/online.ts): the visitor's address only as a hash
  // (visitors.visitor(): "unknown" on a Chest whose front does not name
  // the visitor yet). The quote changed while it was read: "changed" — the
  // page reads it again and says what is different.
  answerQuote: publicAction({
    secret: field.text({ max: 64 }), answer: field.choice(["accepted", "refused"] as const), name: typed(120), agree: field.bool(), reason: typed(1000),
    shown: field.text({ max: 64 }), terms: field.optional(field.text({ max: 64 })),
  }, async (input, { request, locale, charge }): Promise<null> => {
    const sql = db();
    const day = today();
    const opened = await online.openLink(sql, input.secret, day);
    if (!opened) fail("not_found");
    await charge(input.answer === "accepted" ? "accept" : "decline", { subject: online.hashSecret(input.secret) });
    const done = await online.answer(sql, input.secret, {
      answer: input.answer, name: input.name, agree: input.agree ? "yes" : "", reason: input.reason, shown: input.shown, terms: input.terms ?? "",
    }, { hash: visitors.visitor(request.headers), userAgent: request.headers.get("user-agent") ?? "", language: localeOf(locale) }, day);
    after("bell", () => answeredOnline(done.full, done.answer));
    return redirect(`/q/${input.secret}?answered=1`);
  }, { maxBody: 16 << 10, bound: { formSeconds: 3, budgets: { accept: { perVisitor: 20, perDay: 600, perSubject: 20 }, decline: { perVisitor: 20, perDay: 600, perSubject: 20 } } } }),
};

// What the paper keeps after an autosave: the totals the server counted.
export type Saved = Pick<documents.Doc, "net" | "vat" | "gross" | "rates" | "language" | "vatTreatment" | "franchise" | "clientId" | "updatedAt">;
