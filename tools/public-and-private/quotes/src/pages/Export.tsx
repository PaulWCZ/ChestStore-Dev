import { AppError, Island, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { chest } from "@argentic/chest-sdk/chest";
import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { Info, Table, Zip } from "../components/icons.tsx";
import { format, formatDay, formatSize, localeOf, plural } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { listDocuments } from "../lib/documents.ts";
import { period as checkPeriod, type Period } from "../lib/export.ts";
import { addDays } from "../shared/model.ts";
import { formatMoney } from "../shared/money.ts";
import { listArchives } from "../lib/monthly.ts";

// The accountant's export: choose a period, see what it holds, download the
// spreadsheet or the PDFs.
function presets(today: string): { key: string; period: Period }[] {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const monthStart = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}-01`;
  const monthEnd = (yy: number, mm: number) => addDays(mm === 12 ? `${yy + 1}-01-01` : monthStart(yy, mm + 1), -1);
  const q = Math.floor((m - 1) / 3);
  const lastQ = q === 0 ? { y: y - 1, q: 3 } : { y, q: q - 1 };
  const lm = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  return [
    { key: "lastMonth", period: { from: monthStart(lm.y, lm.m), to: monthEnd(lm.y, lm.m) } },
    { key: "thisMonth", period: { from: monthStart(y, m), to: monthEnd(y, m) } },
    { key: "lastQuarter", period: { from: monthStart(lastQ.y, lastQ.q * 3 + 1), to: monthEnd(lastQ.y, lastQ.q * 3 + 3) } },
    { key: "thisQuarter", period: { from: monthStart(y, q * 3 + 1), to: monthEnd(y, q * 3 + 3) } },
    { key: "lastYear", period: { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` } },
    { key: "thisYear", period: { from: `${y}-01-01`, to: `${y}-12-31` } },
  ];
}

export async function exportPage(ctx: PageContext<MemberContext>): Promise<View> {
  const { member, t } = ctx;
  const locale = localeOf(ctx.locale);
  const x = t.exportPage;
  if (!can(member, "export")) {
    return { title: x.title, body: <div className="page narrow"><EmptyState headingLevel={1} title={x.title} body={t.errors.forbidden} /></div> };
  }
  const today = chest.today();
  const choices = presets(today);
  let chosen = choices[0]!.period;
  let invalid = false;
  const from = ctx.query("from"), to = ctx.query("to");
  if (from !== undefined && to !== undefined) {
    try {
      chosen = checkPeriod(from, to);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      invalid = true;
    }
  }
  const rows = (await listDocuments(db(), member, { types: ["invoice", "credit"], from: chosen.from, to: chosen.to }, today)).filter(r => r.status === "final");
  const invoices = rows.filter(r => r.type === "invoice");
  const credits = rows.filter(r => r.type === "credit");
  const currency = rows[0]?.currency ?? chest.currency;
  const sum = (key: "net" | "vat" | "gross") => rows.reduce((s, r) => s + (r.type === "credit" ? -r[key] : r[key]), 0);
  const query = new URLSearchParams(chosen).toString();
  const day = (d: string) => formatDay(d, locale, { day: "numeric", month: "long", year: "numeric" });
  const archives = await listArchives(db(), member);
  const monthName = (period: string) => formatDay(period + "-01", locale, { month: "long", year: "numeric" });
  const size = (bytes: number) => formatSize(bytes, locale);
  const body = (
    <div className="page narrow">
      <PageHeader size="m" title={x.title} intro={x.intro} />
      <section className="panel" aria-labelledby="period">
        <h2 id="period">{x.period}</h2>
        <nav className="filters" aria-label={x.period}>
          {choices.map(c => (
            <a key={c.key} href={`/chest/export?${new URLSearchParams(c.period).toString()}`} aria-current={c.period.from === chosen.from && c.period.to === chosen.to ? "true" : undefined}>
              {x.presets[c.key as keyof typeof x.presets]}
            </a>
          ))}
        </nav>
        <Island id={`period-${chosen.from}-${chosen.to}`} name="PeriodForm" props={{ from: chosen.from, to: chosen.to, today, labels: t.kit.date, words: { from: x.from, to: x.to, show: x.show } }} />
        {invalid && <p className="error" role="alert">{t.errors.period_invalid}</p>}
      </section>
      <section className="panel" aria-labelledby="summary">
        <h2 id="summary">{format(x.summary, { from: day(chosen.from), to: day(chosen.to) })}</h2>
        {rows.length === 0 ? <p className="muted">{x.nothing}</p> : (
          <>
            <dl className="facts wide">
              <dt>{x.invoices}</dt><dd>{plural(x.count, invoices.length, locale)}</dd>
              <dt>{x.credits}</dt><dd>{plural(x.count, credits.length, locale)}</dd>
              <dt>{x.net}</dt><dd>{formatMoney(sum("net"), currency, locale)}</dd>
              <dt>{x.vat}</dt><dd>{formatMoney(sum("vat"), currency, locale)}</dd>
              <dt>{x.gross}</dt><dd className="strong">{formatMoney(sum("gross"), currency, locale)}</dd>
            </dl>
            <div className="downloads">
              <a className="button download" href={`/chest/export/zip?${query}`} download><Zip />{x.zip}</a>
              <a className="button quiet download" href={`/chest/export/journal?${query}`} download><Table />{x.journal}</a>
              <a className="button quiet download" href={`/chest/export/csv?${query}`} download><Table />{x.csv}</a>
            </div>
            <ul className="hint export-notes">
              <li>{x.zipHint}</li>
              <li>{x.journalHint}</li>
              <li>{x.csvHint}</li>
            </ul>
          </>
        )}
      </section>
      <section className="panel" aria-labelledby="archives">
        <h2 id="archives">{x.archives}</h2>
        <p className="hint">{x.archivesHint}</p>
        {archives.length === 0 ? <p className="muted">{x.archivesNone}</p> : (
          <ul className="archives">
            {archives.map(a => (
              <li key={a.period + a.part}>
                <span>
                  <strong>{a.parts > 1 ? format(x.archivePart, { month: monthName(a.period), part: a.part, parts: a.parts }) : monthName(a.period)}</strong>
                  <span className="sub">{plural(x.count, a.documents, locale)} · {size(a.size)}{a.downloadedAt ? " · " + x.archiveKept : ""}</span>
                </span>
                <a className="button quiet small download" href={`/chest/export/archives/${a.period}?part=${a.part}`} download><Zip />{x.archiveDownload}</a>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel" aria-labelledby="lists">
        <h2 id="lists">{x.lists}</h2>
        <p className="hint">{x.listsHint}</p>
        <div className="downloads">
          <a className="button quiet download" href="/chest/export/lists/clients" download><Table />{x.clients}</a>
          <a className="button quiet download" href="/chest/export/lists/items" download><Table />{x.items}</a>
        </div>
      </section>
      <div className="callout quiet" role="note">
        <Info />
        <div>
          <p><strong>{x.keepTitle}</strong></p>
          <p>{x.keep}</p>
        </div>
      </div>
    </div>
  );
  return { title: x.title, body };
}
