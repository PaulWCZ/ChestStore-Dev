import * as chest from "@argentic/chest-sdk/chest";
import { notFound } from "next/navigation";
import { can } from "../../../../lib/access.ts";
import { clientMissing, listClients } from "../../../../lib/clients.ts";
import { company, missing } from "../../../../lib/company.ts";
import { db } from "../../../../lib/db.ts";
import { editAbility, editable, getDocument, upcomingNumber, type Full } from "../../../../lib/documents.ts";
import { AppError } from "../../../../lib/errors.ts";
import { catalogue, format, formatDate, formatDay, locales, type Catalogue, type Locale } from "../../../../lib/i18n/index.ts";
import { listItems } from "../../../../lib/items.ts";
import { formatMoney } from "../../../../lib/money.ts";
import { sellerOf } from "../../../../lib/parties.ts";
import { nameOf, people } from "../../../../lib/people.ts";
import { countryName, kindOf } from "../../../../lib/rows.ts";
import { viewer } from "../../../../lib/session.ts";
import type { ClientOption, DocView, Fact, Moment, PaymentView, RelatedView } from "../../../../lib/views.ts";
import { DocumentView } from "./document-view.tsx";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const { id } = await params;
  const sql = db();
  const today = chest.today();
  const zone = chest.timeZone();
  let full: Full;
  try {
    full = await getDocument(sql, member, id, today);
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  }
  const c = await company(sql);
  const seller = full.seller ?? sellerOf(c);
  const canEdit = editable(full) && can(member, editAbility(full.type));
  const clients: ClientOption[] = canEdit
    ? (await listClients(sql, member)).map(x => ({ ...x, countryName: countryName(x.country, full.language) }))
    : [];
  if (full.client && !clients.some(x => x.id === full.client!.id)) clients.push({ ...full.client, countryName: countryName(full.client.country, full.language) });
  const items = canEdit ? (await listItems(sql, member)).map(i => ({ id: i.id, name: i.name, description: i.description, unit: i.unit, unitPrice: i.unitPrice, vatRate: i.vatRate, goods: i.goods })) : [];
  const buyer = full.buyer ?? full.client;
  const ref = full.related.find(r => (full.type === "credit" ? r.id === full.invoiceId : r.id === full.quoteId));
  const doc: DocView = {
    id: full.id, type: full.type, status: full.status, state: full.state, number: full.number, kindText: kindOf(full, t), clientId: full.clientId, title: full.title,
    language: full.language, currency: full.currency, issueDate: full.issueDate, deliveryDate: full.deliveryDate, validUntil: full.validUntil, dueDate: full.dueDate,
    paymentDays: full.paymentDays, vatTreatment: full.vatTreatment, franchise: full.franchise, notes: full.notes, depositPercent: full.depositPercent, lines: full.lines,
    net: full.net, vat: full.vat, gross: full.gross, rates: full.rates, paid: full.paid, credited: full.credited, due: full.due, seller,
    buyer: buyer ? { kind: buyer.kind, name: buyer.name, contact: buyer.contact, email: buyer.email, address: buyer.address, postcode: buyer.postcode, city: buyer.city, country: buyer.country, deliveryAddress: buyer.deliveryAddress, siren: buyer.siren, vatNumber: buyer.vatNumber, countryName: countryName(buyer.country, full.language) } : null,
    readyAt: full.readyAt, sentAt: full.sentAt, emailedTo: full.emailedTo, reminders: full.reminders,
    reference: ref && ref.number ? { id: ref.id, number: ref.number, date: ref.issueDate ?? "" } : null,
  };

  // Names and dates, written here.
  const ids = [full.createdBy, full.sentBy, full.decidedBy, full.finalisedBy, ...full.payments.map(p => p.createdBy)].filter((x): x is string => typeof x === "string");
  const who = await people(ids);
  const name = (id: string | null) => (id === member.id ? t.people.you : nameOf(who.get(id ?? ""), locale));
  const when = (iso: string) => formatDate(iso, locale, { timeZone: zone, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const day = (d: string | null) => (d ? formatDay(d, locale) : "");
  const money = (minor: number) => formatMoney(minor, full.currency, locale);
  const history: Moment[] = [{ text: format(t.doc.history.created, { name: name(full.createdBy) }), when: when(full.createdAt) }];
  if (full.readyAt && full.status === "draft") history.push({ text: t.doc.history.ready, when: when(full.readyAt) });
  if (full.finalisedAt) history.push({ text: format(t.doc.history.finalised, { name: name(full.finalisedBy), number: full.number ?? "" }), when: when(full.finalisedAt) });
  if (full.sentAt) history.push({ text: full.emailedTo ? format(t.doc.history.emailed, { to: full.emailedTo, name: name(full.sentBy) }) : format(t.doc.history.sentByHand, { name: name(full.sentBy) }), when: when(full.sentAt) });
  if (full.decidedAt) history.push({ text: format(full.status === "accepted" ? t.doc.history.accepted : t.doc.history.refused, { name: name(full.decidedBy) }), when: when(full.decidedAt) });
  if (full.remindedAt) history.push({ text: format(t.doc.history.reminded, { count: full.reminders }), when: when(full.remindedAt) });

  const facts: Fact[] = [];
  if (full.number) facts.push({ label: t.doc.facts.number, value: full.number });
  facts.push({ label: t.doc.facts.total, value: money(full.gross), strong: true });
  if (full.type === "quote" && full.validUntil) facts.push({ label: t.doc.facts.validUntil, value: day(full.validUntil) });
  if (full.type === "invoice" && full.status === "final") {
    facts.push({ label: t.doc.facts.dueDate, value: day(full.dueDate) });
    if (full.paid > 0) facts.push({ label: t.doc.facts.paid, value: money(full.paid) });
    if (full.credited > 0) facts.push({ label: t.doc.facts.credited, value: money(full.credited) });
    facts.push({ label: t.doc.facts.left, value: money(Math.max(full.due, 0)), strong: true });
  }

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

  return (
    <DocumentView
      key={full.id + full.status + (full.number ?? "")}
      doc={doc}
      t={t}
      locale={locale}
      today={today}
      todayText={day(today)}
      dates={{ issue: day(full.issueDate ?? today), due: day(full.dueDate), valid: day(full.validUntil), delivery: day(full.deliveryDate), reference: day(ref?.issueDate ?? null) }}
      rights={{ edit: canEdit, quote: can(member, "quotes.write"), draftInvoice: can(member, "invoices.draft"), issue: can(member, "invoices.issue"), pay: can(member, "payments"), settings: can(member, "settings") }}
      clients={clients}
      items={items}
      logo={seller.logo ? `/chest/logo?v=${encodeURIComponent(seller.logo)}` : null}
      facts={facts}
      history={history}
      payments={payments}
      related={related}
      words={Object.fromEntries(locales.map(l => [l, catalogue(l).pdf])) as Record<Locale, Catalogue["pdf"]>}
      mailWorks={c.mailWorks}
      upcoming={upcoming ?? null}
      companyMissing={gaps}
      clientMissing={clientGaps}
      readyText={full.readyAt ? format(t.doc.readyOn, { date: when(full.readyAt) }) : null}
    />
  );
}
