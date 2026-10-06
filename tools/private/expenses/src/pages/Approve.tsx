import { Island, type PageContext, type View } from "@argentic/chest-app";
import { chest } from "@argentic/chest-sdk/chest";
import { NoAccess } from "@argentic/chest-ui/components";
import { localeOf, plural, relative } from "../i18n/index.ts";
import type { PersonGroup } from "../islands/ApproveView.tsx";
import { can } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { decided, totals, waiting, warnings, type Expense } from "../lib/expenses.ts";
import { formatMoney } from "../shared/money.ts";
import { leftNote, nameOf, people } from "../lib/people.ts";
import { rowView } from "../lib/rows.ts";
import { allowances, categories, settings } from "../lib/settings.ts";

// To approve: what people sent, grouped by person, oldest first; approve
// one or all, refuse one with a reason. Then what was approved lately.
export async function approvePage({ member, t, locale: language }: PageContext): Promise<View> {
  const locale = localeOf(language);
  if (!can(member, "approve")) return { title: t.approve.title, body: <div className="page"><NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.errors.forbidden }} /></div> };
  const sql = db();
  const list = await waiting(sql, member);
  const recent = await decided(sql, member);
  const [cats, company, warned] = await Promise.all([categories(sql, { archived: true }), settings(sql), warnings(sql, list, { anyone: true })]);
  const who = await people([...list, ...recent].map(e => e.owner), { leftAt: true });
  const flat = new Map((await allowances(sql, { archived: true })).map(a => [a.id, a]));
  const ctx = { t, locale, allowances: flat, categories: new Map(cats.map(c => [c.id, c])), warnings: warned, currency: company.currency };
  const money = (l: Expense[]) => totals(l).map(x => formatMoney(x.amount, x.currency, locale)).join(" + ");
  const byOwner = new Map<string, Expense[]>();
  for (const e of list) byOwner.set(e.owner, [...(byOwner.get(e.owner) ?? []), e]);
  const now = new Date();
  const groups: PersonGroup[] = [...byOwner].map(([owner, l]) => ({
    owner,
    name: nameOf(who.get(owner), locale),
    photo: who.get(owner)?.photo ?? null,
    summary: plural(t.approve.summary, l.length, locale, { total: money(l) }),
    sent: l[0]?.submittedAt ? relative(l[0].submittedAt, locale, now) : "",
    // Someone who left, and when: approving still means paying them (on
    // their last pay slip, never by the transfer file).
    left: leftNote(who.get(owner), locale, t.approve, chest.timeZone, now),
    rows: l.map(e => rowView(e, ctx)),
  }));
  return {
    title: t.approve.title,
    body: (
      <div className="page">
        <Island name="AutoRefresh" props={{ seconds: 30 }} />
        <div className="page-head"><h1>{t.approve.title}</h1></div>
        <Island
          name="ApproveView"
          props={{
            groups,
            recent: recent.map(e => rowView(e, { ...ctx, who: nameOf(who.get(e.owner), locale) })),
            locale,
            t: { approve: t.approve, detail: t.detail, form: t.form, dialog: t.dialog, companyCard: t.status.companyCard },
          }}
        />
      </div>
    ),
  };
}
