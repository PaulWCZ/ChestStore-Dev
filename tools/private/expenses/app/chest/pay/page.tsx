import { NoAccess } from "@argentic/chest-ui/components";
import { can } from "../../../lib/access.ts";
import { bankViews } from "../../../lib/bank.ts";
import { db } from "../../../lib/db.ts";
import { paidRecently, toPay, totals, warnings, type Expense } from "../../../lib/expenses.ts";
import { format, formatDate, plural, relative } from "../../../lib/i18n/index.ts";
import { today } from "../../../lib/model.ts";
import { formatMoney } from "../../../lib/money.ts";
import { readiness, runs } from "../../../lib/payments.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { rowView } from "../../../lib/rows.ts";
import { viewer } from "../../../lib/session.ts";
import { allowances, categories, settings } from "../../../lib/settings.ts";
import { PayView, type PayGroup } from "./pay-view.tsx";

const recentChange = 30 * 86400000;

// To pay back: what was approved and paid with people's own money, by
// person, with the total to transfer. Everyone with bank details at once,
// by one transfer file for the bank; or one person at a time, "Mark paid"
// once the bank did it.
export default async function Pay() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "pay")) return <div className="page"><NoAccess title={t.noAccess.title} body={t.errors.forbidden} /></div>;
  const sql = db();
  const [list, recent, cats, company, ready, files] = await Promise.all([toPay(sql, member), paidRecently(sql, member), categories(sql, { archived: true }), settings(sql), readiness(sql, member), runs(sql, member)]);
  const [who, banks, warned] = await Promise.all([people([...list, ...recent].map(e => e.owner)), bankViews(sql, member, [...new Set(list.map(e => e.owner))]), warnings(sql, list, { anyone: true })]);
  const flat = new Map((await allowances(sql, { archived: true })).map(a => [a.id, a]));
  const ctx = { t, locale, allowances: flat, categories: new Map(cats.map(c => [c.id, c])), currency: company.currency, warnings: new Map([...warned].map(([id, w]) => [id, w.filter(x => x.code === "no_rate")])) };
  const money = (l: Expense[]) => totals(l).map(x => formatMoney(x.amount, x.currency, locale)).join(" + ");
  const byOwner = new Map<string, Expense[]>();
  for (const e of list) byOwner.set(e.owner, [...(byOwner.get(e.owner) ?? []), e]);
  const now = Date.now();
  // In the file: people with an account of the SEPA zone, their expenses
  // with an amount in euros.
  const inFile = (l: Expense[]) => l.filter(e => e.base !== null && e.baseCurrency === "EUR");
  const groups: PayGroup[] = [...byOwner].map(([owner, l]) => {
    const bank = banks.get(owner);
    return {
      owner,
      name: nameOf(who.get(owner), locale),
      photo: who.get(owner)?.photo ?? null,
      total: money(l),
      summary: plural(t.approve.summary, l.length, locale, { total: money(l) }),
      rows: l.map(e => rowView(e, ctx)),
      bank: bank ? { masked: bank.masked, bic: bank.bic, holder: bank.holder, since: relative(bank.updatedAt, locale), sepa: bank.sepa, changed: now - Date.parse(bank.updatedAt) < recentChange ? format(t.pay.changed, { when: relative(bank.updatedAt, locale) }) : null } : null,
    };
  });
  const payable = ready === "ready" ? [...byOwner].filter(([owner]) => banks.get(owner)?.sepa).map(([, l]) => inFile(l)).filter(l => l.length > 0) : [];
  const fileTotal = payable.reduce((sum, l) => sum + l.reduce((s, e) => s + (e.base ?? 0), 0), 0);
  const grand = money(list);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t.pay.title}</h1>
          {grand && <p className="mono">{format(t.pay.total, { total: grand })}</p>}
        </div>
      </div>
      <PayView
        groups={groups}
        ready={ready}
        preview={payable.length > 0 ? { count: payable.length, label: plural(t.pay.make, payable.length, locale, { total: formatMoney(fileTotal, "EUR", locale) }) } : null}
        files={files.map(f => ({ id: f.id, cancelled: f.cancelled, title: format(t.pay.fileFor, { date: formatDate(f.executionDate + "T12:00:00Z", locale, { day: "numeric", month: "long" }) }), sub: `${plural(t.pay.fileCount, f.count, locale)} · ${formatMoney(f.total, f.currency, locale)}` }))}
        recent={recent.map(e => ({ ...rowView(e, { ...ctx, who: nameOf(who.get(e.owner), locale) }), sub: [nameOf(who.get(e.owner), locale), e.paidOn ? formatDate(e.paidOn + "T12:00:00Z", locale, { day: "numeric", month: "short" }) : ""].filter(Boolean).join(" · ") }))}
        today={today()}
        locale={locale}
        t={{ pay: t.pay, errors: t.errors, bank: t.settings.bank, cancel: t.form.cancel, dialog: t.dialog, date: t.date }}
      />
      <p className="legal">{t.pay.companyCard}</p>
    </div>
  );
}
