import { Avatar } from "@argentic/chest-ui/components";
import { format } from "../i18n/format.ts";
import type { Locale } from "../i18n/index.ts";
import { BulkBar, BulkProvider, PageCheck, RowCheck, type BulkWords, type ListQuery } from "../components/bulk.tsx";
import { DealTable, type DealRow } from "../components/deal-table.tsx";
import { Download } from "../components/icons.tsx";
import type { People, Teammate, Words } from "../components/shared.ts";

// The lists whose rows may be ticked and changed at once (lib/bulk.ts):
// the rows, the ticks and the bar of what to do with them share one
// selection, so they are one island each. Every word and figure of a row
// is written by the server.
type Selecting = { writes: boolean; team: Teammate[]; me: string; canAssign: boolean; locale: Locale };
type ListWords = BulkWords & Words<"people">;

// A company of the list.
export type CompanyRow = { id: string; name: string; sub: string; tags: string[]; contacts: string; deals: string; when: string; owner: string | null };
export function CompanyList({ rows, total, filter, owners, writes, team, me, canAssign, locale, t }: Selecting & { rows: CompanyRow[]; total: number; filter: ListQuery; owners: People; t: ListWords & Words<"companies"> }) {
  return (
    <BulkProvider>
      {writes && rows.length > 0 && <div className="list-summary"><PageCheck ids={rows.map(r => r.id)} total={total} table="companies" filter={filter} locale={locale} t={t} /></div>}
      {writes && <BulkBar table="companies" team={team} me={me} canAssign={canAssign} canDelete locale={locale} t={t} />}
      <ul className={`rows${writes ? " selectable" : ""}`}>
        {rows.map(c => (
          <li key={c.id} id={`company-${c.id}`}>
            {writes && <RowCheck id={c.id} label={format(t.common.bulk.select, { name: c.name })} />}
            <a className="row-link" href={`/chest/companies/${c.id}`}>
              <span className="row-main">
                <span className="row-title">{c.name}</span>
                <span className="row-sub">{c.sub}{c.tags.map(tag => <span key={tag} className="tag">{tag}</span>)}</span>
              </span>
              <span className="row-figures">
                <span className="figure">{c.contacts}</span>
                <span className="figure">{c.deals}</span>
              </span>
              <span className="row-when muted" title={t.companies.lastActivity}>{c.when}</span>
              <Owner id={c.owner} owners={owners} t={t} />
            </a>
          </li>
        ))}
      </ul>
    </BulkProvider>
  );
}

// A person of the list.
export type ContactRow = { id: string; name: string; sub: string; email: string; step: { text: string; state: string } | null; when: string; owner: string | null };
export function ContactList({ rows, total, filter, owners, writes, team, me, canAssign, locale, t }: Selecting & { rows: ContactRow[]; total: number; filter: ListQuery; owners: People; t: ListWords & Words<"contacts"> }) {
  return (
    <BulkProvider>
      {writes && rows.length > 0 && <div className="list-summary"><PageCheck ids={rows.map(r => r.id)} total={total} table="contacts" filter={filter} locale={locale} t={t} /></div>}
      {writes && <BulkBar table="contacts" team={team} me={me} canAssign={canAssign} canDelete locale={locale} t={t} />}
      <ul className={`rows${writes ? " selectable" : ""}`}>
        {rows.map(c => (
          <li key={c.id} id={`contact-${c.id}`}>
            {writes && <RowCheck id={c.id} label={format(t.common.bulk.select, { name: c.name })} />}
            <a className="row-link" href={`/chest/contacts/${c.id}`}>
              <span className="row-main">
                <span className="row-title">{c.name}</span>
                <span className="row-sub">{c.sub}{c.email ? <span className="mono-sub">{c.email}</span> : null}</span>
              </span>
              <span className="row-figures">
                {c.step ? <span className={`due ${c.step.state}`}>{c.step.text}</span> : null}
              </span>
              <span className="row-when muted" title={t.contacts.lastContact}>{c.when}</span>
              <Owner id={c.owner} owners={owners} t={t} />
            </a>
          </li>
        ))}
      </ul>
    </BulkProvider>
  );
}

function Owner({ id, owners, t }: { id: string | null; owners: People; t: ListWords }) {
  return <span className="row-owner">{id ? <Avatar name={owners[id]?.name ?? "?"} photo={owners[id]?.photo ?? null} size="s" label={owners[id]?.name ?? t.people.unknown} /> : <Avatar name="?" size="s" className="avatar-none" label={t.common.unassigned} />}</span>;
}

// The deals as a list (the board's other view): the kit's table, its rows
// ticked to give many to someone at once.
export function DealList({ rows, writes, team, me, canAssign, locale, labels, words, t, summary }: Selecting & { rows: DealRow[]; labels: Parameters<typeof DealTable>[0]["labels"]; words: Parameters<typeof DealTable>[0]["words"]; summary: { text: string; exportHref: string; exportLabel: string }; t: BulkWords }) {
  return (
    <BulkProvider>
      {writes && <BulkBar table="deals" team={team} me={me} canAssign={canAssign} canDelete={false} locale={locale} t={t} />}
      <div className="list-summary">
        <span className="num">{summary.text}</span>
        <a className="link-button" href={summary.exportHref} download><Download />{summary.exportLabel}</a>
      </div>
      {rows.length > 0 && <DealTable writes={writes} labels={labels} words={words} rows={rows} />}
    </BulkProvider>
  );
}
