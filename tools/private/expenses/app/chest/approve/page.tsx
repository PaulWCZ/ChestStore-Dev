import { AutoRefresh } from "../../../components/auto-refresh.tsx";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { decided, totals, waiting, warnings, type Expense } from "../../../lib/expenses.ts";
import { plural, relative } from "../../../lib/i18n/index.ts";
import { formatMoney } from "../../../lib/money.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { rowView } from "../../../lib/rows.ts";
import { viewer } from "../../../lib/session.ts";
import { categories, settings } from "../../../lib/settings.ts";
import { ApproveView, type PersonGroup } from "./approve-view.tsx";

// To approve: what people sent, grouped by person, oldest first; approve
// one or all, refuse one with a reason. Then what was approved lately.
export default async function Approve() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "approve")) return <main className="page"><div className="empty"><h1>{t.noAccess.title}</h1><p>{t.errors.forbidden}</p></div></main>;
  const sql = db();
  const list = await waiting(sql, member);
  const recent = await decided(sql, member);
  const [cats, company, warned] = await Promise.all([categories(sql, { archived: true }), settings(sql), warnings(sql, list, { anyone: true })]);
  const who = await people([...list, ...recent].map(e => e.owner));
  const ctx = { t, locale, categories: new Map(cats.map(c => [c.id, c])), warnings: warned, currency: company.currency };
  const money = (l: Expense[]) => totals(l).map(x => formatMoney(x.amount, x.currency, locale)).join(" + ");
  const byOwner = new Map<string, Expense[]>();
  for (const e of list) byOwner.set(e.owner, [...(byOwner.get(e.owner) ?? []), e]);
  const now = new Date();
  const groups: PersonGroup[] = [...byOwner].map(([owner, l]) => ({
    owner,
    name: owner === member.id ? t.people.you : nameOf(who.get(owner), locale),
    photo: who.get(owner)?.photo ?? null,
    summary: plural(t.approve.summary, l.length, locale, { total: money(l) }),
    sent: l[0]?.submittedAt ? relative(l[0].submittedAt, locale, now) : "",
    self: owner === member.id,
    rows: l.map(e => rowView(e, ctx)),
  }));
  return (
    <main className="page">
      <AutoRefresh seconds={30} />
      <div className="page-head"><h1>{t.approve.title}</h1></div>
      <ApproveView
        groups={groups}
        recent={recent.map(e => rowView(e, { ...ctx, who: nameOf(who.get(e.owner), locale) }))}
        locale={locale}
        t={{ approve: t.approve, detail: t.detail, form: t.form, errors: t.errors, companyCard: t.status.companyCard }}
      />
    </main>
  );
}
