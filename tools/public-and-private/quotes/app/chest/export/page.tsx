import * as chest from "@argentic/chest-sdk/chest";
import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { Info, Table, Zip } from "../../../components/icons.tsx";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { listDocuments } from "../../../lib/documents.ts";
import { AppError } from "../../../lib/errors.ts";
import { period as checkPeriod, type Period } from "../../../lib/export.ts";
import { format, formatDay, plural } from "../../../lib/i18n/index.ts";
import { addDays } from "../../../lib/model.ts";
import { formatMoney } from "../../../lib/money.ts";
import { viewer } from "../../../lib/session.ts";
import { PeriodForm } from "./period-form.tsx";

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

export default async function ExportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const x = t.exportPage;
  if (!can(member, "export")) {
    return <div className="page narrow"><EmptyState headingLevel={1} title={x.title} body={t.errors.forbidden} /></div>;
  }
  const today = chest.today();
  const params = await searchParams;
  const choices = presets(today);
  let chosen = choices[0]!.period;
  let invalid = false;
  if (typeof params["from"] === "string" && typeof params["to"] === "string") {
    try {
      chosen = checkPeriod(params["from"], params["to"]);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      invalid = true;
    }
  }
  const rows = (await listDocuments(db(), member, { types: ["invoice", "credit"], from: chosen.from, to: chosen.to }, today)).filter(r => r.status === "final");
  const invoices = rows.filter(r => r.type === "invoice");
  const credits = rows.filter(r => r.type === "credit");
  const currency = rows[0]?.currency ?? chest.currency();
  const sum = (key: "net" | "vat" | "gross") => rows.reduce((s, r) => s + (r.type === "credit" ? -r[key] : r[key]), 0);
  const query = new URLSearchParams(chosen).toString();
  const day = (d: string) => formatDay(d, locale, { day: "numeric", month: "long", year: "numeric" });
  return (
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
        <PeriodForm key={chosen.from + chosen.to} from={chosen.from} to={chosen.to} today={today} labels={t.date} words={{ from: x.from, to: x.to, show: x.show }} />
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
}
