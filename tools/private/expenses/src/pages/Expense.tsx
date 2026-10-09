import { AppError, Island, type PageContext, type View } from "@argentic/chest-app";
import { Back } from "../components/icons.tsx";
import { format, formatDate, localeOf, plural, shortDate, type Catalogue, type Locale } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { approversFor } from "../lib/approvals.ts";
import { db } from "../lib/db.ts";
import { expense, warnings } from "../lib/expenses.ts";
import { thumbnailTypes } from "../shared/model.ts";
import { formatMoney, rateText, recoverable } from "../shared/money.ts";
import { nameOf, people } from "../lib/people.ts";
import { allowanceWords, stampOf, warningText } from "../lib/rows.ts";
import { allowances, categories, settings } from "../lib/settings.ts";
import { categoryName, km, powerName, vehicleName } from "../shared/words.ts";

// One expense: its receipt beside it, what it is, where it stands, what
// happened to it — and, for whoever may, Approve / Refuse or Edit / Delete.
export async function expensePage({ member, t, locale: language, param }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const id = param("id");
  const sql = db();
  const found = await expense(sql, member, id).catch((error: unknown) => {
    if (error instanceof AppError) return null;
    throw error;
  });
  if (!found || found.expense.deleted) throw new AppError("not_found");
  const { expense: e, access, history } = found;
  const [cats, company, warned] = await Promise.all([categories(sql, { archived: true }), settings(sql), warnings(sql, [e], { anyone: access.decide || can(member, "see.all") })]);
  const category = cats.find(c => c.id === e.categoryId);
  const flat = allowanceWords(e, { t, locale, allowances: new Map((await allowances(sql, { archived: true })).map(a => [a.id, a])) });
  const who = await people([e.owner, ...(e.approver ? [e.approver] : []), ...history.map(h => h.actor), ...e.guests.members]);
  const name = (id: string) => (id === member.id ? t.people.youInText : id === "chest" ? t.people.accountants : nameOf(who.get(id), locale));
  // A day as it is; an instant on the reader's day (their zone).
  const date = (d: string) => (d.length === 10 ? formatDate(d + "T12:00:00Z", locale, { day: "numeric", month: "long", year: "numeric" }) : formatDate(d, locale, { day: "numeric", month: "long", year: "numeric", timeZone: member.timeZone }));

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

  const waitingFor = e.status === "submitted" ? (e.approver ? format(t.home.waitingFor, { name: name(e.approver) }) : (await approversFor(sql, e.owner)).length === 0 ? t.home.waitingNobody : format(t.home.waitingFor, { name: t.people.accountants })) : null;
  return {
    title: format(t.detail.title, { ref: "E" + e.id }),
    body: (
      <div className="page wide">
        <a className="link-button back" href={access.own ? "/chest" : access.decide ? "/chest/approve" : "/chest"}><Back />{t.form.back}</a>
        {/* Keyed by the expense: another expense is another island. */}
        <Island
          id={`expense-${e.id}`}
          name="DetailView"
          props={{
            id: e.id,
            own: access.own,
            draft: e.status === "draft",
            retract: access.own && e.status === "submitted",
            decide: access.decide,
            receipt,
            trip: e.trip ? format(t.trip.detail, { from: e.trip.from, to: e.trip.to }) : null,
            flat: flat ? `${flat.name} · ${t.allowance.hint}` : null,
            owner: access.own ? null : format(t.detail.by, { name: nameOf(who.get(e.owner), locale) }),
            amount: formatMoney(e.amount, e.currency, locale),
            stamp: stampOf(e, t),
            card: e.paidBy === "company" ? t.status.companyCard : null,
            facts,
            warnings: (warned.get(e.id) ?? []).map(w => warningText(w, t, company.currency, locale)),
            reason: e.status === "draft" && e.refusedReason ? format(t.home.refusedBecause, { reason: e.refusedReason }) : null,
            waitingFor,
            history: history.map(h => ({ when: shortDate(h.at, locale, member.timeZone), text: historyText(h, t, locale, name, e.paidOn) })),
            t: { detail: t.detail, receipt: t.receipt, form: t.form, deleted: t.home.deleted, approved: t.approve.approved, refused: t.approve.refused },
            locale,
          }}
        />
      </div>
    ),
  };
}

function historyText(h: { kind: string; actor: string; detail: string }, t: Catalogue, locale: Locale, name: (id: string) => string, paidOn: string | null): string {
  const words = t.history[h.kind as keyof Catalogue["history"]] ?? h.kind;
  const day = h.kind === "paid" ? (h.detail || paidOn || "") : "";
  return format(words, { name: name(h.actor), reason: h.detail, date: day ? formatDate(day + "T12:00:00Z", locale, { day: "numeric", month: "long" }) : "" });
}
