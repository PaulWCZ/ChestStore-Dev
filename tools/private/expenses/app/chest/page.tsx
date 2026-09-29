import { AutoRefresh } from "../../components/auto-refresh.tsx";
import { db } from "../../lib/db.ts";
import { mine, totals, warnings } from "../../lib/expenses.ts";
import { dot, format, formatDate } from "../../lib/i18n/index.ts";
import { formatMoney } from "../../lib/money.ts";
import { nameOf, people } from "../../lib/people.ts";
import { rowView } from "../../lib/rows.ts";
import { viewer } from "../../lib/session.ts";
import { allowances, categories, settings } from "../../lib/settings.ts";
import { can } from "../../lib/access.ts";
import { alone } from "../../lib/approvals.ts";
import { HomeView, type HomeGroup } from "./home-view.tsx";
import { SetupBanner } from "./setup-banner.tsx";

const shown = 400;

// My expenses: what to send (the drafts, refused ones first), what waits,
// what is approved, what was paid back — and the three figures that matter.
export default async function MyExpenses() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const list = await mine(sql, member, { limit: shown });
  const [cats, company, warned] = await Promise.all([categories(sql, { archived: true }), settings(sql), warnings(sql, list)]);
  const byId = new Map(cats.map(c => [c.id, c]));
  const approvers = await people(list.filter(e => e.status === "submitted" && e.approver).map(e => e.approver!));
  const flat = new Map((await allowances(sql, { archived: true })).map(a => [a.id, a]));
  const ctx = { t, locale, allowances: flat, categories: byId, warnings: warned, currency: company.currency };
  const money = (l: typeof list) => totals(l).map(x => formatMoney(x.amount, x.currency, locale)).join(" + ") || formatMoney(0, company.currency, locale);

  const drafts = list.filter(e => e.status === "draft").sort((a, b) => Number(b.refusedReason !== null) - Number(a.refusedReason !== null));
  const submitted = list.filter(e => e.status === "submitted");
  const toBePaid = list.filter(e => e.status === "approved" && e.paidBy === "me");
  const done = list.filter(e => e.status === "paid" || (e.status === "approved" && e.paidBy === "company"));
  const year = new Date().getFullYear().toString();
  const paidThisYear = list.filter(e => e.status === "paid" && (e.paidOn ?? "").startsWith(year));

  // Earlier: by month of the expense, newest first.
  const months = new Map<string, typeof list>();
  for (const e of done) months.set(e.spentOn.slice(0, 7), [...(months.get(e.spentOn.slice(0, 7)) ?? []), e]);
  const history: HomeGroup[] = [...months].map(([m, l]) => ({ key: m, title: formatDate(m + "-15T12:00:00Z", locale, { month: "long", year: "numeric" }), total: money(l), rows: l.map(e => rowView(e, ctx)) }));

  // An accountant with nobody to approve their own expenses (no other
  // accountant, nobody named for them): theirs wait, and this page says so.
  const lonely = can(member, "settings") && (await alone(sql)).includes(member.id);
  const waitingFor = (id: string | null) => (id ? format(t.home.waitingFor, { name: nameOf(approvers.get(id), locale) }) : lonely ? t.home.waitingNobody : format(t.home.waitingFor, { name: t.people.accountants }));
  return (
    <div className="page">
      <AutoRefresh seconds={30} />
      {can(member, "settings") && !company.setupDone && <SetupBanner t={t.home.setup} errors={t.errors} />}
      {lonely && <p className="notice alone"><span>{t.home.alone} <a href="/chest/settings/company#approvers">{t.home.aloneLink}</a></span></p>}
      <HomeView
        locale={locale}
        empty={list.length === 0}
        figures={{ waiting: money(submitted), toPay: money(toBePaid), paid: money(paidThisYear) }}
        drafts={drafts.map(e => ({ ...rowView(e, ctx), amountValue: e.amount, currency: e.currency, blocked: e.refusedUnchanged, fixed: e.refusedReason !== null && !e.refusedUnchanged }))}
        waiting={{ key: "waiting", title: t.home.waiting, total: money(submitted), rows: submitted.map(e => ({ ...rowView(e, ctx), sub: [rowView(e, ctx).sub, waitingFor(e.approver)].filter(Boolean).join(dot) })) }}
        approved={{ key: "approved", title: t.home.approved, total: money(toBePaid), rows: toBePaid.map(e => rowView(e, ctx)) }}
        history={history}
        limit={list.length >= shown ? format(t.home.limit, { count: shown }) : null}
        t={{ home: t.home, figures: { waiting: t.home.totalWaiting, toPay: t.home.totalToPay, paid: t.home.totalPaid }, errors: t.errors, refused: t.status.refused, companyCard: t.status.companyCard }}
      />
    </div>
  );
}

