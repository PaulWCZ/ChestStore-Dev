import { Island, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { chest } from "@argentic/chest-sdk/chest";
import { catalogue, format, formatDate, formatDay, localeOf, locales, type Catalogue, type Locale } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { clientMissing } from "../lib/clients.ts";
import { company, missing } from "../lib/company.ts";
import { db } from "../lib/db.ts";
import { editAbility, editable, getDocument, upcomingNumber, type Full } from "../lib/documents.ts";
import { mailState } from "../lib/mailing.ts";
import { formatMoney } from "../shared/money.ts";
import { sellerOf } from "../shared/parties.ts";
import { continuedAt } from "../lib/numbering.ts";
import { versioned } from "../shared/model.ts";
import { answersOf, liveLink } from "../lib/online.ts";
import { versionsOf } from "../lib/versions.ts";
import { handoffOf } from "../lib/timesheets.ts";
import { nameOf, people } from "../lib/people.ts";
import { answerUrl } from "../lib/public-origin.ts";
import { firstRepeatDate, repeatOf } from "../lib/repeats.ts";
import { countryName, kindOf } from "../lib/rows.ts";
import type { AnswerView, ClientOption, DocView, DocWords, Fact, Moment, OnlineView, PaymentView, RelatedView } from "../lib/views.ts";

// The sections of the catalogue the document's island uses.
export const docWords = (t: Catalogue): DocWords => ({
  doc: t.doc, states: t.states, errors: t.errors, shell: t.shell, list: t.list, common: t.common, methods: t.methods, editor: t.editor, picker: t.picker,
  clientForm: t.clientForm, send: t.send, finalise: t.finalise, fromQuote: t.fromQuote, payment: t.payment, repeatDialog: t.repeatDialog, kit: t.kit, settings: { fields: t.settings.fields },
});

// A document's page: the paper, and in its margin what it is now and the
// one thing to do next (src/islands/document/). Names and dates are
// written here, on the server.
export async function documentPage(ctx: PageContext<MemberContext>): Promise<View> {
  const { member, t } = ctx;
  const locale = localeOf(ctx.locale);
  const sql = db();
  const today = chest.today();
  // The member's own zone for the moments of the history.
  const zone = member.timeZone;
  const full = await getDocument(sql, member, ctx.param("id"), today);
  const c = await company(sql);
  const mailing = await mailState(sql);
  const seller = full.seller ?? sellerOf(c);
  const repeating = full.type === "invoice" ? await repeatOf(sql, full.id) : null;
  const canEdit = editable(full) && can(member, editAbility(full.type));
  // The document's client only: the pickers search the others on the
  // server (an island's props stay small, whatever the lists hold).
  const clients: ClientOption[] = full.client ? [{ ...full.client, countryName: countryName(full.client.country, full.language) }] : [];
  const buyer = full.buyer ?? full.client;
  const ref = full.related.find(r => (full.type === "credit" ? r.id === full.invoiceId : r.id === full.quoteId));
  const doc: DocView = {
    id: full.id, type: full.type, status: full.status, state: full.state, number: full.type === "quote" ? versioned(full.number, full.version) : full.number, version: full.version, kindText: kindOf(full, t), clientId: full.clientId, title: full.title,
    language: full.language, currency: full.currency, issueDate: full.issueDate, deliveryDate: full.deliveryDate, validUntil: full.validUntil, dueDate: full.dueDate,
    paymentDays: full.paymentDays, vatTreatment: full.vatTreatment, franchise: full.franchise, notes: full.notes, depositPercent: full.depositPercent, lines: full.lines,
    net: full.net, vat: full.vat, gross: full.gross, rates: full.rates, paid: full.paid, credited: full.credited, due: full.due, seller,
    buyer: buyer ? { kind: buyer.kind, name: buyer.name, contact: buyer.contact, email: buyer.email, address: buyer.address, postcode: buyer.postcode, city: buyer.city, country: buyer.country, deliveryAddress: buyer.deliveryAddress, siren: buyer.siren, vatNumber: buyer.vatNumber, countryName: countryName(buyer.country, full.language) } : null,
    readyAt: full.readyAt, sentAt: full.sentAt, emailedTo: full.emailedTo, reminders: full.reminders,
    crmTitle: full.crmTitle,
    reference: ref && ref.number ? { id: ref.id, number: versioned(ref.number, ref.version) ?? ref.number, date: ref.issueDate ?? "" } : null,
    facturx: full.type !== "quote" && full.status === "final" && full.pdfFormat !== "pdf",
    repeat: repeating && repeating.repeat.sourceId === full.id && repeating.repeat.active
      ? { id: repeating.repeat.id, every: repeating.repeat.every, next: formatDay(repeating.repeat.nextOn, locale, { day: "numeric", month: "long", year: "numeric" }) } : null,
    madeFrom: repeating && repeating.repeat.sourceId !== full.id ? { id: repeating.repeat.sourceId, number: repeating.sourceNumber ?? "" } : null,
    imported: full.status === "imported",
    timesheets: full.type === "invoice" ? await handoffView(sql, full, t, locale) : null,
  };

  // Names and dates, written here.
  // A quote's earlier versions (lib/versions.ts), the latest first.
  const earlier = full.type === "quote" ? await versionsOf(sql, member, full.id) : [];
  const ids = [full.createdBy, full.sentBy, full.decidedBy, full.finalisedBy, ...full.payments.map(p => p.createdBy), ...earlier.flatMap(v => [v.replacedBy, v.sentBy])].filter((x): x is string => typeof x === "string");
  const who = await people(ids);
  const name = (id: string | null) => (id === member.id ? t.people.you : id === "tool:crm" ? t.doc.history.crmTool : id === "tool:timesheets" ? t.doc.history.timesheetsTool : nameOf(who.get(id ?? ""), locale));
  const when = (iso: string) => formatDate(iso, locale, { timeZone: zone, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const day = (d: string | null) => (d ? formatDay(d, locale) : "");
  const money = (minor: number) => formatMoney(minor, full.currency, locale);
  const history: Moment[] = [{ text: full.crmTitle ? format(t.doc.history.fromCrm, { title: full.crmTitle }) : format(t.doc.history.created, { name: name(full.createdBy) }), when: when(full.createdAt) }];
  if (full.crmReopenedAt) history.push({ text: t.doc.history.crmReopened, when: when(full.crmReopenedAt) });
  if (full.readyAt && full.status === "draft") history.push({ text: t.doc.history.ready, when: when(full.readyAt) });
  if (full.finalisedAt) history.push({ text: format(t.doc.history.finalised, { name: name(full.finalisedBy), number: full.number ?? "" }), when: when(full.finalisedAt) });
  for (const v of [...earlier].reverse()) {
    if (v.sentAt) history.push({ text: format(t.doc.history.versionSent, { version: v.version }), when: when(v.sentAt) });
    history.push({ text: format(t.doc.history.revised, { version: v.version + 1, name: name(v.replacedBy) }), when: when(v.replacedAt) });
  }
  if (full.sentAt) history.push({ text: full.emailedTo ? format(t.doc.history.emailed, { to: full.emailedTo, name: name(full.sentBy) }) : format(t.doc.history.sentByHand, { name: name(full.sentBy) }), when: when(full.sentAt) });
  if (full.decidedAt && full.decidedBy !== "client") history.push({ text: format(full.status === "accepted" ? t.doc.history.accepted : t.doc.history.refused, { name: name(full.decidedBy) }), when: when(full.decidedAt) });
  if (full.remindedAt) history.push({ text: format(t.doc.history.reminded, { count: full.reminders }), when: when(full.remindedAt) });
  // The first number after the sequence was continued from another tool.
  const [numbered] = await sql<{ year: number | null; seq: number | null }[]>`select year, seq from documents where id = ${full.id}`;
  const continued = numbered ? await continuedAt(sql, { type: full.type, year: numbered.year, seq: numbered.seq }) : null;
  if (continued && full.number) {
    const setter = (await people([continued.changedBy])).get(continued.changedBy);
    history.push({ text: format(t.doc.history.continued, { number: full.number, name: continued.changedBy === member.id ? t.people.you : nameOf(setter, locale) }), when: when(continued.changedAt) });
  }
  for (const step of await sql<{ step: number; channel: "email" | "bell"; done_at: Date }[]>`select step, channel, done_at from reminder_steps where document_id = ${full.id} and channel <> 'none' order by step`) {
    history.push({ text: format(step.channel === "email" ? t.doc.history.autoEmailed : t.doc.history.autoTold, { step: step.step + 1 }), when: when(step.done_at.toISOString()) });
  }
  // The answers given online, with their proof.
  let online: OnlineView | null = null;
  if (full.type === "quote" && (full.status !== "draft" || full.version > 1)) {
    const answers = await answersOf(sql, member, full.id);
    const link = await liveLink(sql, full.id);
    const o = t.doc.online;
    const views: AnswerView[] = answers.map(a => ({
      id: a.id,
      accepted: a.answer === "accepted",
      title: format(a.answer === "accepted" ? o.acceptedBy : o.refusedBy, { name: a.name }),
      when: when(a.answeredAt),
      reason: a.reason,
      proof: [
        { label: o.proof.name, value: a.name },
        { label: o.proof.day, value: day(a.answeredOn) },
        { label: o.proof.time, value: when(a.answeredAt) },
        { label: o.proof.version, value: versioned(a.number, a.version) ?? String(a.version) },
        { label: o.proof.amount, value: formatMoney(a.gross, a.currency, locale) },
        { label: o.proof.visitor, value: a.visitorHash },
        { label: o.proof.browser, value: a.userAgent || "—" },
        { label: o.proof.pdf, value: a.pdfSha256 },
        ...(a.termsSha256 ? [{ label: o.proof.terms, value: a.termsSha256 }] : []),
      ],
      pdf: a.pdfObject ? `/chest/documents/${full.id}/answers/${a.id}` : null,
    }));
    for (const a of answers) history.push({ text: a.answer === "accepted" ? format(t.doc.history.acceptedOnline, { name: a.name }) : format(t.doc.history.refusedOnline, { name: a.name }), when: when(a.answeredAt) });
    online = { url: link ? answerUrl(link.secret) : null, live: link !== null, until: day(full.validUntil), answers: views };
  }
  if (full.status === "imported") history.push({ text: t.doc.history.imported, when: when(full.createdAt) });
  if (repeating && repeating.repeat.sourceId !== full.id) history.push({ text: format(t.doc.history.fromRepeat, { number: repeating.sourceNumber ?? "" }), when: when(full.createdAt) });

  const facts: Fact[] = [];
  if (full.number) facts.push({ label: t.doc.facts.number, value: full.type === "quote" ? versioned(full.number, full.version) ?? full.number : full.number });
  facts.push({ label: t.doc.facts.total, value: money(full.gross), strong: true });
  if (full.type === "quote" && full.validUntil) facts.push({ label: t.doc.facts.validUntil, value: day(full.validUntil) });
  if (full.type === "invoice" && full.status === "final") {
    facts.push({ label: t.doc.facts.dueDate, value: day(full.dueDate) });
    if (full.paid > 0) facts.push({ label: t.doc.facts.paid, value: money(full.paid) });
    if (full.credited > 0) facts.push({ label: t.doc.facts.credited, value: money(full.credited) });
    facts.push({ label: t.doc.facts.left, value: money(Math.max(full.due, 0)), strong: true });
  }

  if (doc.facturx) facts.push({ label: t.doc.facts.format, value: t.doc.facts.facturx });

  const payments: PaymentView[] = full.payments.map(p => ({ id: p.id, date: day(p.paidOn), amount: money(p.amount), method: t.methods[p.method as keyof Catalogue["methods"]] ?? p.method, note: p.note }));
  const related: RelatedView[] = full.related.map(r => ({
    id: r.id,
    text: `${kindOf({ type: r.type, depositPercent: r.depositPercent }, t)} ${r.number ?? t.states.draft.toLowerCase()}`,
    amount: money(r.type === "credit" ? -r.gross : r.gross),
    state: r.status === "draft" ? t.states.draft : r.issueDate ? day(r.issueDate) : "",
  }));

  const upcoming = full.number ? undefined : await upcomingNumber(sql, full.type, today);
  const gaps = missing(c);
  const clientGaps = full.client ? clientMissing(full.client) : [];
  if (full.client && full.vatTreatment === "reverse_charge" && !c.franchise && !full.client.vatNumber && !full.client.siren) clientGaps.push("vatNumber");

  // The island's key: a document changed into another state (numbered,
  // a new version) starts its paper afresh.
  const key = `${full.id}-${full.status}-${full.number ?? ""}-${full.version}`;
  return {
    title: `${kindOf(full, t)} ${doc.number ?? ""}`.trim(),
    body: (
      <Island id={`doc-${key}`} name="DocumentView" props={{
        doc,
        t: docWords(t),
        locale,
        today,
        todayText: day(today),
        dates: { issue: day(full.issueDate ?? today), due: day(full.dueDate), valid: day(full.validUntil), delivery: day(full.deliveryDate), reference: day(ref?.issueDate ?? null) },
        rights: { edit: canEdit, quote: can(member, "quotes.write"), draftInvoice: can(member, "invoices.draft"), issue: can(member, "invoices.issue"), pay: can(member, "payments"), settings: can(member, "settings") },
        clients,
        logo: seller.logo ? `/chest/logo?v=${encodeURIComponent(seller.logo)}` : null,
        facts,
        history,
        online,
        versions: earlier.map(v => ({
          version: v.version,
          text: v.issueDate ? format(t.doc.versions.sent, { version: v.version, date: day(v.issueDate), amount: formatMoney(v.gross, v.currency, locale) })
            : format(t.doc.versions.notSent, { version: v.version, amount: formatMoney(v.gross, v.currency, locale) }),
          pdf: v.hasPdf ? `/chest/documents/${full.id}/versions/${v.version}` : null,
        })),
        payments,
        related,
        words: Object.fromEntries(locales.map(l => [l, catalogue(l).pdf])) as Record<Locale, Catalogue["pdf"]>,
        mailWorks: mailing.works,
        mailReason: mailing.reason,
        upcoming: upcoming ?? null,
        companyMissing: gaps,
        clientMissing: clientGaps,
        readyText: full.readyAt ? format(t.doc.readyOn, { date: when(full.readyAt) }) : null,
        repeatDates: full.type === "invoice" && full.status === "final" && full.depositPercent === null && full.issueDate
          ? { month: firstRepeatDate(full.issueDate, "month", today), quarter: firstRepeatDate(full.issueDate, "quarter", today), year: firstRepeatDate(full.issueDate, "year", today) } : null,
      }} />
    ),
  };
}

// Where an invoice came from in Timesheets, as its margin says it; what
// Timesheets counted, when this invoice counts otherwise (src/lib/timesheets.ts).
type Counted = Pick<Full, "id" | "net" | "currency">;
async function handoffView(sql: ReturnType<typeof db>, full: Counted, t: Catalogue, locale: Locale): Promise<DocView["timesheets"]> {
  const h = await handoffOf(sql, full.id);
  if (!h) return null;
  const counted = h.counted !== null && h.counted !== full.net ? format(t.doc.timesheetsCounted, { counted: formatMoney(h.counted, full.currency, locale), invoice: formatMoney(full.net, full.currency, locale) }) : null;
  return { project: h.project, client: h.client, link: h.link, counted };
}
