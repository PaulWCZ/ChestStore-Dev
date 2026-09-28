import * as chest from "@argentic/chest-sdk/chest";
import { Ledger } from "../../components/ledger.tsx";
import { Alert, BlankSheet, Plus } from "../../components/icons.tsx";
import { NewDocument } from "../../components/new-document.tsx";
import { can } from "../../lib/access.ts";
import { company, missing } from "../../lib/company.ts";
import { db } from "../../lib/db.ts";
import { desk } from "../../lib/desk.ts";
import { format, formatDay, plural } from "../../lib/i18n/index.ts";
import { formatMoney } from "../../lib/money.ts";
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
  const d = await desk(sql, member, today);
  const c = await company(sql);
  const gaps = missing(c);
  const currency = d.currency ?? chest.currency();
  const money = (minor: number) => formatMoney(minor, currency, locale);
  const who = await people(d.needs.map(n => n.row.createdBy));
  const canQuote = can(member, "quotes.write");
  const head = t.list.head;
  const reason = (n: (typeof d.needs)[number]) => {
    const r = n.row;
    if (n.reason === "ready") return format(t.desk.reasons.ready, { name: nameOf(who.get(r.createdBy), locale) });
    if (n.reason === "overdue") return format(t.desk.reasons.overdue, { date: formatDay(r.dueDate ?? today, locale), amount: money(r.due) });
    if (n.reason === "accepted") return t.desk.reasons.accepted;
    if (n.reason === "expiring") return format(r.validUntil && r.validUntil < today ? t.desk.reasons.expired : t.desk.reasons.expiring, { date: formatDay(r.validUntil ?? today, locale) });
    return format(t.desk.reasons.draft, { date: formatDay(r.updatedAt.slice(0, 10), locale) });
  };
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <p>{formatDay(today, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          <h1>{t.desk.title}</h1>
        </div>
        {canQuote && (
          <div className="actions">
            {can(member, "invoices.draft") && <NewDocument type="invoice" className="button quiet" errors={t.errors}><Plus />{t.desk.newInvoice}</NewDocument>}
            <NewDocument type="quote" errors={t.errors}><Plus />{t.desk.newQuote}</NewDocument>
          </div>
        )}
      </div>

      {gaps.length > 0 && (
        <div className="callout" role="note">
          <Alert />
          <div>
            <p><strong>{t.desk.incomplete.title}</strong></p>
            <p>{can(member, "settings") ? t.desk.incomplete.admin : t.desk.incomplete.others}</p>
            {can(member, "settings") && <p className="actions"><a className="button small" href="/chest/settings">{t.desk.incomplete.action}</a></p>}
          </div>
        </div>
      )}

      {d.empty ? (
        <div className="empty">
          <BlankSheet />
          <h2>{t.desk.empty.title}</h2>
          <p>{t.desk.empty.body}</p>
          {canQuote && (
            <div className="actions">
              <NewDocument type="quote" errors={t.errors}><Plus />{t.desk.empty.action}</NewDocument>
              <a className="button quiet" href="/chest/clients">{t.desk.empty.clients}</a>
            </div>
          )}
        </div>
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

          <section className="section" aria-labelledby="needs">
            <h2 id="needs">{t.desk.needs}</h2>
            {d.needs.length === 0 ? (
              <p className="muted">{t.desk.nothing}</p>
            ) : (
              <ul className="todo">
                {d.needs.map(n => (
                  <li key={n.reason + n.row.id}>
                    <span className={n.reason === "overdue" || n.reason === "ready" ? "dot alert" : n.reason === "accepted" ? "dot ok" : "dot"} aria-hidden="true" />
                    <span>
                      <a className="main" href={`/chest/documents/${n.row.id}`}><span className="visually-hidden">{kindOf(n.row, t)} {n.row.number ?? ""}</span></a>
                      <strong>{kindOf(n.row, t)} {n.row.number ?? ""} · {n.row.clientName || t.list.noClient}</strong>
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
              <Ledger rows={d.recent.map(r => rowView(r, t, locale))} head={head} />
            </section>
          )}
        </>
      )}
    </main>
  );
}
