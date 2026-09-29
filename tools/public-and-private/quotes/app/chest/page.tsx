import * as chest from "@argentic/chest-sdk/chest";
import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { DocTable } from "../../components/doc-table.tsx";
import { Alert, BlankSheet, Plus, Zip } from "../../components/icons.tsx";
import { NewDocument } from "../../components/new-document.tsx";
import { can } from "../../lib/access.ts";
import { company, missing } from "../../lib/company.ts";
import { db } from "../../lib/db.ts";
import { desk } from "../../lib/desk.ts";
import { followUpOnce } from "../../lib/followup.ts";
import { waitingArchives } from "../../lib/monthly.ts";
import { format, formatDay, plural } from "../../lib/i18n/index.ts";
import { formatMoney } from "../../lib/money.ts";
import { change, revenue } from "../../lib/revenue.ts";
import { versioned } from "../../lib/model.ts";
import { nameOf, people } from "../../lib/people.ts";
import { kindOf, rowView } from "../../lib/rows.ts";
import { viewer } from "../../lib/session.ts";

// The desk: what the company waits for, what is late, what needs you now.
export default async function DeskPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const today = chest.today();
  // The morning's follow-up (reminders, recurring drafts), when the Chest's
  // schedule has not run it today.
  await followUpOnce(sql, today);
  const d = await desk(sql, member, today);
  // A month's archive nobody kept a copy of yet (for who exports).
  const archive = (await waitingArchives(sql, member))[0] ?? null;
  const c = await company(sql);
  const gaps = missing(c);
  const currency = d.currency ?? chest.currency();
  const money = (minor: number) => formatMoney(minor, currency, locale);
  // Revenue, for whoever reads the books (lib/revenue.ts).
  const sales = d.empty ? null : await revenue(sql, member, today, chest.currency());
  const who = await people([...d.needs.map(n => n.row.createdBy), ...(sales?.bySeller.map(s => s.id) ?? [])]);
  const monthName = (key: string) => formatDay(key + "-01", locale, { month: "long", year: "numeric" });
  const versus = (before: number, key: string, now: number) => {
    const pct = change(before, now);
    const text = format(t.desk.revenue.compared, { month: monthName(key), amount: money(before) });
    return pct === null || pct === 0 ? text : `${text} · ${format(pct > 0 ? t.desk.revenue.changeUp : t.desk.revenue.changeDown, { percent: Math.abs(pct) })}`;
  };
  const canQuote = can(member, "quotes.write");
  const isAdmin = can(member, "settings");
  // While the legal details are missing, filling them is an administrator's
  // one obvious action: every other button is quiet.
  const fillFirst = gaps.length > 0 && isAdmin;
  const switching = isAdmin ? t.desk.empty.switchingAdmin : can(member, "invoices.issue") ? t.desk.empty.switchingBilling : can(member, "clients.write") ? t.desk.empty.switching : undefined;
  const head = t.list.head;
  const reason = (n: (typeof d.needs)[number]) => {
    const r = n.row;
    if (n.reason === "ready") return format(t.desk.reasons.ready, { name: nameOf(who.get(r.createdBy), locale) });
    if (n.reason === "overdue") return format(t.desk.reasons.overdue, { date: formatDay(r.dueDate ?? today, locale), amount: money(r.due) });
    if (n.reason === "accepted") return t.desk.reasons.accepted;
    if (n.reason === "crm") return format(t.desk.reasons.crm, { title: r.crmTitle ?? "" });
    if (n.reason === "expiring") return format(r.validUntil && r.validUntil < today ? t.desk.reasons.expired : t.desk.reasons.expiring, { date: formatDay(r.validUntil ?? today, locale) });
    return format(t.desk.reasons.draft, { date: formatDay(r.updatedAt.slice(0, 10), locale) });
  };
  return (
    <div className="page">
      <p className="over-title">{formatDay(today, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
      <PageHeader
        size="m"
        title={t.desk.title}
        secondary={canQuote && !d.empty && can(member, "invoices.draft") ? <NewDocument type="invoice" className="button quiet" errors={t.errors}><Plus />{t.desk.newInvoice}</NewDocument> : undefined}
        action={canQuote && !d.empty ? <NewDocument type="quote" className={fillFirst ? "button quiet" : undefined} errors={t.errors}><Plus />{t.desk.newQuote}</NewDocument> : undefined}
      />

      {/* Only for who writes documents: a reader has nothing to send. */}
      {gaps.length > 0 && canQuote && (
        <div className="callout" role="note">
          <Alert />
          <div>
            <p><strong>{t.desk.incomplete.title}</strong></p>
            <p>{can(member, "settings") ? t.desk.incomplete.admin : t.desk.incomplete.others}</p>
            {can(member, "settings") && <p className="actions"><a className="button small" href="/chest/settings">{t.desk.incomplete.action}</a></p>}
          </div>
        </div>
      )}

      {archive && !fillFirst && (
        <div className="callout quiet" role="note">
          <Zip />
          <div>
            <p><strong>{format(t.desk.archive.title, { month: formatDay(archive.period + "-01", locale, { month: "long", year: "numeric" }) })}</strong></p>
            <p>{t.desk.archive.body}</p>
            <p className="actions"><a className="button quiet small" href={`/chest/export/archives/${archive.period}?part=${archive.part}`} download>{t.desk.archive.action}</a></p>
          </div>
        </div>
      )}

      {d.empty ? (
        canQuote ? (
          <EmptyState
            icon={<BlankSheet />}
            title={t.desk.empty.title}
            body={t.desk.empty.body}
            action={
              <>
                <NewDocument type="quote" className={fillFirst ? "button quiet" : undefined} errors={t.errors}><Plus />{t.desk.empty.action}</NewDocument>
                {can(member, "clients.write") && <a className="button quiet" href="/chest/import?kind=clients">{t.desk.empty.clients}</a>}
              </>
            }
            note={switching}
          />
        ) : (
          // Someone who reads (the accountant's seat) is never told to write.
          <EmptyState icon={<BlankSheet />} title={t.desk.empty.readerTitle} body={t.desk.empty.readerBody} />
        )
      ) : (
        <>
          <div className="figures">
            <a className="figure" href="/chest/quotes?state=sent">
              <span className="label">{t.desk.figures.waiting}</span>
              <span className="value">{money(d.waiting.net)}</span>
              <span className="sub">{plural(t.desk.figures.quotes, d.waiting.count, locale)}</span>
            </a>
            <a className="figure" href="/chest/invoices?state=open">
              <span className="label">{t.desk.figures.toCollect}</span>
              <span className="value">{money(d.toCollect.due)}</span>
              <span className="sub">{plural(t.desk.figures.invoices, d.toCollect.count, locale)}</span>
            </a>
            <a className={d.overdue.count > 0 ? "figure alert" : "figure"} href="/chest/invoices?state=overdue">
              <span className="label">{t.desk.figures.overdue}</span>
              <span className="value">{money(d.overdue.due)}</span>
              <span className="sub">{plural(t.desk.figures.invoices, d.overdue.count, locale)}</span>
            </a>
          </div>

          {sales && (
            <section className="section revenue" aria-labelledby="revenue">
              <h2 id="revenue">{t.desk.revenue.title}</h2>
              <div className="revenue-grid">
                <div className="figure plain">
                  <span className="label">{format(t.desk.revenue.thisMonth, { month: monthName(sales.month) })}</span>
                  <span className="value">{money(sales.thisMonth)}</span>
                  <span className="sub">{versus(sales.lastMonth, sales.lastMonthKey, sales.thisMonth)}</span>
                  <span className="sub">{versus(sales.lastYear, sales.lastYearKey, sales.thisMonth)}</span>
                  <span className="sub strong">{format(t.desk.revenue.yearToDate, { amount: money(sales.yearToDate) })}</span>
                </div>
                <div className="ranking">
                  <h3>{t.desk.revenue.byClient}</h3>
                  {sales.byClient.length === 0 ? <p className="muted">{t.desk.revenue.nothing}</p> : (
                    <ol>{sales.byClient.map(c => <li key={c.name}><span>{c.name || t.list.noClient}</span><span className="num">{money(c.net)}</span></li>)}</ol>
                  )}
                </div>
                <div className="ranking">
                  <h3>{t.desk.revenue.bySeller}</h3>
                  {sales.bySeller.length === 0 ? <p className="muted">{t.desk.revenue.nothing}</p> : (
                    <ol>{sales.bySeller.map(p => <li key={p.id}><span>{p.id === "tool:crm" ? t.doc.history.crmTool : nameOf(who.get(p.id), locale)}</span><span className="num">{money(p.net)}</span></li>)}</ol>
                  )}
                </div>
              </div>
              <p className="hint">{t.desk.revenue.note}</p>
            </section>
          )}

          <section className="section" aria-labelledby="needs">
            <h2 id="needs">{t.desk.needs}</h2>
            {d.needs.length === 0 ? (
              <p className="muted">{t.desk.nothing}</p>
            ) : (
              <ul className="todo">
                {d.needs.map(n => (
                  <li key={n.reason + n.row.id}>
                    {/* Red is for money that is late, and only that; work waiting for someone is plain. */}
                    <span className={n.reason === "overdue" ? "dot alert" : n.reason === "accepted" || n.reason === "crm" ? "dot ok" : "dot"} aria-hidden="true" />
                    <span>
                      <a className="main" href={`/chest/documents/${n.row.id}`}><span className="visually-hidden">{kindOf(n.row, t)} {(n.row.type === "quote" ? versioned(n.row.number, n.row.version) : n.row.number) ?? ""}</span></a>
                      <strong>{kindOf(n.row, t)} {(n.row.type === "quote" ? versioned(n.row.number, n.row.version) : n.row.number) ?? ""} · {n.row.clientName || t.list.noClient}</strong>
                      <span className="sub">{reason(n)}</span>
                    </span>
                    <span className="num">{money(n.reason === "overdue" ? n.row.due : n.row.gross)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {d.recent.length > 0 && (
            <section className="section" aria-labelledby="recent">
              <div className="section-head">
                <h2 id="recent">{t.desk.recent}</h2>
              </div>
              <DocTable rows={d.recent.map(r => rowView(r, t, locale, "issued"))} labels={t.table}
                words={{ caption: t.desk.recent, number: head.number, client: head.client, what: head.what, date: head.issued, amount: head.amount, state: head.state, total: t.list.total }} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
