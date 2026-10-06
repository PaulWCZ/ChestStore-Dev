import { Island, type PageContext, type View } from "@argentic/chest-app";
import { can } from "../lib/access.ts";
import { alone } from "../lib/approvals.ts";
import { db } from "../lib/db.ts";
import { mine, totals, warnings } from "../lib/expenses.ts";
import { dot, format, formatDate, localeOf } from "../i18n/index.ts";
import { formatMoney } from "../shared/money.ts";
import { nameOf, people } from "../lib/people.ts";
import { rowView } from "../lib/rows.ts";
import { allowances, categories, settings } from "../lib/settings.ts";
import { today } from "../lib/today.ts";
import type { HomeGroup } from "../islands/HomeView.tsx";

const shown = 400;

// My expenses: what to send (the drafts, refused ones first), what waits,
// what is approved, what was paid back — and the three figures that matter.
export async function homePage({ member, t, locale: language }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const sql = db();
  const list = await mine(sql, member, { limit: shown });
  const [cats, company, warned, flatList, lonelyList] = await Promise.all([categories(sql, { archived: true }), settings(sql), warnings(sql, list), allowances(sql, { archived: true }), can(member, "settings") ? alone(sql) : Promise.resolve([])]);
  const byId = new Map(cats.map(c => [c.id, c]));
  const approvers = await people(list.filter(e => e.status === "submitted" && e.approver).map(e => e.approver!));
  const flat = new Map(flatList.map(a => [a.id, a]));
  const ctx = { t, locale, allowances: flat, categories: byId, warnings: warned, currency: company.currency };
  const money = (l: typeof list) => totals(l).map(x => formatMoney(x.amount, x.currency, locale)).join(" + ") || formatMoney(0, company.currency, locale);

  const drafts = list.filter(e => e.status === "draft").sort((a, b) => Number(b.refusedReason !== null) - Number(a.refusedReason !== null));
  const submitted = list.filter(e => e.status === "submitted");
  const toBePaid = list.filter(e => e.status === "approved" && e.paidBy === "me");
  const done = list.filter(e => e.status === "paid" || (e.status === "approved" && e.paidBy === "company"));
  // "Paid back this year": the company's year (the Chest's day).
  const year = today().slice(0, 4);
  const paidThisYear = list.filter(e => e.status === "paid" && (e.paidOn ?? "").startsWith(year));

  // Earlier: by month of the expense, newest first.
  const months = new Map<string, typeof list>();
  for (const e of done) months.set(e.spentOn.slice(0, 7), [...(months.get(e.spentOn.slice(0, 7)) ?? []), e]);
  const history: HomeGroup[] = [...months].map(([m, l]) => ({ key: m, title: formatDate(m + "-15T12:00:00Z", locale, { month: "long", year: "numeric" }), total: money(l), rows: l.map(e => rowView(e, ctx)) }));

  // An accountant with nobody to approve their own expenses (no other
  // accountant, nobody named for them): theirs wait, and this page says so.
  const lonely = lonelyList.includes(member.id);
  const waitingFor = (id: string | null) => (id ? format(t.home.waitingFor, { name: nameOf(approvers.get(id), locale) }) : lonely ? t.home.waitingNobody : format(t.home.waitingFor, { name: t.people.accountants }));
  return {
    title: t.home.title,
    body: (
      <div className="page">
        <Island name="AutoRefresh" props={{ seconds: 30 }} />
        {can(member, "settings") && !company.setupDone && <Island name="SetupBanner" props={{ t: t.home.setup }} />}
        {lonely && <p className="notice alone"><span>{t.home.alone} <a href="/chest/settings/company#approvers">{t.home.aloneLink}</a></span></p>}
        <Island
          name="HomeView"
          props={{
            locale,
            empty: list.length === 0,
            figures: { waiting: money(submitted), toPay: money(toBePaid), paid: money(paidThisYear) },
            drafts: drafts.map(e => ({ ...rowView(e, ctx), amountValue: e.amount, currency: e.currency, blocked: e.refusedUnchanged, fixed: e.refusedReason !== null && !e.refusedUnchanged })),
            waiting: { key: "waiting", title: t.home.waiting, total: money(submitted), rows: submitted.map(e => { const row = rowView(e, ctx); return { ...row, sub: [row.sub, waitingFor(e.approver)].filter(Boolean).join(dot) }; }) },
            approved: { key: "approved", title: t.home.approved, total: money(toBePaid), rows: toBePaid.map(e => rowView(e, ctx)) },
            history,
            limit: list.length >= shown ? format(t.home.limit, { count: shown }) : null,
            t: { home: t.home, figures: { waiting: t.home.totalWaiting, toPay: t.home.totalToPay, paid: t.home.totalPaid }, refused: t.status.refused, companyCard: t.status.companyCard },
          }}
        />
      </div>
    ),
  };
}
