import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { paidRecently, toPay, totals, type Expense } from "../../../lib/expenses.ts";
import { format, formatDate, plural } from "../../../lib/i18n/index.ts";
import { today } from "../../../lib/model.ts";
import { formatMoney } from "../../../lib/money.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { rowView } from "../../../lib/rows.ts";
import { viewer } from "../../../lib/session.ts";
import { categories, settings } from "../../../lib/settings.ts";
import { PayView, type PayGroup } from "./pay-view.tsx";

// To pay back: what was approved and paid with people's own money, by
// person, with the total to transfer; "Mark paid" once the bank did it.
export default async function Pay() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "pay")) return <main className="page"><div className="empty"><h1>{t.noAccess.title}</h1><p>{t.errors.forbidden}</p></div></main>;
  const sql = db();
  const [list, recent, cats, company] = await Promise.all([toPay(sql, member), paidRecently(sql, member), categories(sql, { archived: true }), settings(sql)]);
  const who = await people([...list, ...recent].map(e => e.owner));
  const ctx = { t, locale, categories: new Map(cats.map(c => [c.id, c])), currency: company.currency };
  const money = (l: Expense[]) => totals(l).map(x => formatMoney(x.amount, x.currency, locale)).join(" + ");
  const byOwner = new Map<string, Expense[]>();
  for (const e of list) byOwner.set(e.owner, [...(byOwner.get(e.owner) ?? []), e]);
  const groups: PayGroup[] = [...byOwner].map(([owner, l]) => ({
    owner,
    name: nameOf(who.get(owner), locale),
    photo: who.get(owner)?.photo ?? null,
    total: money(l),
    summary: plural(t.approve.summary, l.length, locale, { total: money(l) }),
    rows: l.map(e => rowView(e, ctx)),
  }));
  const grand = money(list);
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>{t.pay.title}</h1>
          {grand && <p className="mono">{format(t.pay.total, { total: grand })}</p>}
        </div>
      </div>
      <PayView
        groups={groups}
        recent={recent.map(e => ({ ...rowView(e, { ...ctx, who: nameOf(who.get(e.owner), locale) }), sub: [nameOf(who.get(e.owner), locale), e.paidOn ? formatDate(e.paidOn + "T12:00:00Z", locale, { day: "numeric", month: "short" }) : ""].filter(Boolean).join(" · ") }))}
        today={today()}
        t={{ pay: t.pay, errors: t.errors }}
      />
      <p className="legal">{t.pay.companyCard}</p>
    </main>
  );
}
