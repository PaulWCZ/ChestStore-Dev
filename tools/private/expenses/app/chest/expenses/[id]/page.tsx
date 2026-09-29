import { notFound } from "next/navigation";
import { Back } from "../../../../components/icons.tsx";
import { can } from "../../../../lib/access.ts";
import { AppError } from "../../../../lib/app-error.ts";
import { db } from "../../../../lib/db.ts";
import { expense, warnings } from "../../../../lib/expenses.ts";
import { format, formatDate, plural, type Catalogue, type Locale } from "../../../../lib/i18n/index.ts";
import { thumbnailTypes } from "../../../../lib/model.ts";
import { formatMoney, rateText, recoverable } from "../../../../lib/money.ts";
import { nameOf, people } from "../../../../lib/people.ts";
import { allowanceWords, stampOf, warningText } from "../../../../lib/rows.ts";
import { viewer } from "../../../../lib/session.ts";
import { allowances, categories, settings } from "../../../../lib/settings.ts";
import { categoryName, km, powerName, vehicleName } from "../../../../lib/words.ts";
import { DetailView } from "./detail-view.tsx";

// One expense: its receipt beside it, what it is, where it stands, what
// happened to it — and, for whoever may, Approve / Refuse or Edit / Delete.
export default async function ExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const { id } = await params;
  const sql = db();
  const found = await expense(sql, member, id).catch(error => {
    if (error instanceof AppError) return null;
    throw error;
  });
  if (!found || found.expense.deleted) notFound();
  const { expense: e, access, history } = found;
  const [cats, company, warned] = await Promise.all([categories(sql, { archived: true }), settings(sql), warnings(sql, [e], { anyone: access.decide || can(member, "see.all") })]);
  const category = cats.find(c => c.id === e.categoryId);
  const flat = allowanceWords(e, { t, locale, allowances: new Map((await allowances(sql, { archived: true })).map(a => [a.id, a])) });
  const who = await people([e.owner, ...(e.approver ? [e.approver] : []), ...history.map(h => h.actor), ...e.guests.members]);
  const name = (id: string) => (id === member.id ? t.people.youInText : id === "chest" ? t.people.accountants : nameOf(who.get(id), locale));
  const date = (d: string) => formatDate(d.length === 10 ? d + "T12:00:00Z" : d, locale, { day: "numeric", month: "long", year: "numeric" });

  const facts: [string, string][] = [[t.detail.fields.date, date(e.spentOn)], [t.detail.fields.category, categoryName(category, t)]];
  if (e.trip) {
    facts.push([t.detail.fields.trip, format(t.trip.detail, { from: e.trip.from, to: e.trip.to })]);
    facts.push([t.detail.fields.distance, format(t.trip.km, { km: km(e.trip.distance, locale) })]);
    facts.push([t.detail.fields.scale, `${format(t.trip.scaleNote, { year: e.trip.scaleYear })} · ${vehicleName(e.trip.vehicle, t)} ${powerName(e.trip.vehicle, e.trip.power, t)}${e.trip.electric ? " · " + t.trip.electric : ""}`]);
  } else if (flat) {
    facts.push([t.detail.fields.allowance, `${flat.name}\n${flat.detail}`]);
  } else {
    if (e.merchant) facts.push([t.detail.fields.merchant, e.merchant]);
    if (e.nights !== null && e.nights > 1) facts.push([t.detail.fields.nights, `${e.nights} · ${format(t.form.perNight, { amount: formatMoney(Math.round(e.amount / e.nights), e.currency, locale) })}`]);
    const guests = [...e.guests.members.map(g => nameOf(who.get(g), locale)), ...e.guests.names];
    if (e.alone) facts.push([t.detail.fields.guests, t.form.alone]);
    if (guests.length > 0) facts.push([t.detail.fields.guests, `${guests.join(", ")}\n${plural(t.form.perPerson, guests.length + 1, locale, { amount: formatMoney(Math.round(e.amount / (guests.length + 1)), e.currency, locale) })}`]);
    facts.push([t.detail.fields.paidBy, e.paidBy === "me" ? t.form.paidByMe : t.form.paidByCompany]);
    if (e.rate !== null && e.base !== null && e.baseCurrency) facts.push([t.detail.fields.rate, `1 ${e.currency} = ${rateText(e.rate, locale)} ${e.baseCurrency}\n${format(t.form.converted, { amount: formatMoney(e.base, e.baseCurrency, locale) })}`]);
    if (e.vat !== null) facts.push([t.detail.fields.vat, formatMoney(e.vat, e.currency, locale) + (can(member, "see.all") && category ? ` · ${category.vatRecovery} % → ${formatMoney(recoverable(e.vat, category.vatRecovery), e.currency, locale)}` : "")]);
  }
  if (can(member, "see.all") && category?.account) facts.push([t.detail.fields.account, category.account]);
  if (e.note) facts.push([t.detail.fields.note, e.note]);

  const receipt = e.receipt
    ? { image: thumbnailTypes.includes(e.receipt.type) ? `/chest/receipts/${e.id}?size=1024` : null, open: `/chest/receipts/${e.id}`, download: `/chest/receipts/${e.id}?download=1`, name: e.receipt.name }
    : null;

  return (
    <main className="page wide">
      <a className="link-button" href={access.own ? "/chest" : access.decide ? "/chest/approve" : "/chest"} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 12 }}><Back />{t.form.back}</a>
      <DetailView
        id={e.id}
        own={access.own}
        draft={e.status === "draft"}
        decide={access.decide}
        receipt={receipt}
        trip={e.trip ? format(t.trip.detail, { from: e.trip.from, to: e.trip.to }) : null}
        flat={flat ? `${flat.name} · ${t.allowance.hint}` : null}
        owner={access.own ? null : format(t.detail.by, { name: nameOf(who.get(e.owner), locale) })}
        amount={formatMoney(e.amount, e.currency, locale)}
        stamp={stampOf(e, t)}
        card={e.paidBy === "company" ? t.status.companyCard : null}
        facts={facts}
        warnings={(warned.get(e.id) ?? []).map(w => warningText(w, t, company.currency, locale))}
        reason={e.status === "draft" && e.refusedReason ? format(t.home.refusedBecause, { reason: e.refusedReason }) : null}
        waitingFor={e.status === "submitted" ? format(t.home.waitingFor, { name: e.approver ? name(e.approver) : t.people.accountants }) : null}
        history={history.map(h => ({ when: formatDate(h.at, locale, { day: "numeric", month: "short" }), text: historyText(h, t, locale, name, e.paidOn) }))}
        t={{ detail: t.detail, receipt: t.receipt, form: t.form, errors: t.errors, deleted: t.home.deleted, undo: t.home.undo, approved: t.approve.approved, refused: t.approve.refused }}
        locale={locale}
      />
    </main>
  );
}

function historyText(h: { kind: string; actor: string; detail: string }, t: Catalogue, locale: Locale, name: (id: string) => string, paidOn: string | null): string {
  const words = t.history[h.kind as keyof Catalogue["history"]] ?? h.kind;
  const day = h.kind === "paid" ? (h.detail || paidOn || "") : "";
  return format(words, { name: name(h.actor), reason: h.detail, date: day ? formatDate(day + "T12:00:00Z", locale, { day: "numeric", month: "long" }) : "" });
}
