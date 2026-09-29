import { Avatar, EmptyState } from "@argentic/chest-ui/components";
import Link from "next/link";
import { Card, Download } from "../../../components/icons.tsx";
import { can } from "../../../lib/access.ts";
import { tagsInUse } from "../../../lib/companies.ts";
import { listContacts } from "../../../lib/contacts.ts";
import { db } from "../../../lib/db.ts";
import { fieldFilterOf, listFields } from "../../../lib/fields.ts";
import { format, plural, relative } from "../../../lib/i18n/index.ts";
import { dueState, today } from "../../../lib/model.ts";
import { dueLabel } from "../../../lib/page-data.ts";
import { directory } from "../../../lib/people.ts";
import { viewer } from "../../../lib/session.ts";
import { team as teamOf } from "../../../lib/team.ts";
import { BulkBar, BulkProvider, PageCheck, RowCheck } from "../ui/bulk.tsx";
import { NewContactButton } from "../ui/contact-form.tsx";
import { ListFilters } from "../ui/list-filters.tsx";
import { Pager } from "../ui/pager.tsx";
import { emptyContact } from "../ui/values.ts";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

// Every person, 100 a page, by name (or last contact, or newest): where
// they work, their next step, when they were last in touch. Ticked, many
// change at once.
export default async function Contacts({ searchParams }: { searchParams: Search }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const params = await searchParams;
  const get = (key: string) => one(params[key]);
  const field = fieldFilterOf(get);
  const filter = { q: get("q"), owner: get("owner"), tag: get("tag"), stale: get("stale") === "1", ...(field ? { field } : {}) };
  const sql = db();
  const [{ rows, total, page, pageSize }, tags, people, fields] = await Promise.all([
    listContacts(sql, member, filter, { page: get("page"), sort: get("sort") }),
    tagsInUse(sql, "contacts"),
    teamOf(),
    listFields(sql, "contacts"),
  ]);
  const owners = await directory(rows.map(r => r.owner), locale);
  const now = today();
  const kept: Record<string, string> = Object.fromEntries(["q", "owner", "tag", "stale", "sort", "cf", "cv", "cmin", "cmax"].map(k => [k, get(k)] as [string, string]).filter(([, x]) => x !== ""));
  const filtered = filter.q !== "" || filter.owner !== "" || filter.tag !== "" || filter.stale || field !== undefined;
  const query = new URLSearchParams(Object.entries(kept).filter(([k]) => k !== "sort")).toString();
  const team = people.map(p => ({ id: p.id, name: p.name, photo: p.photo }));
  const writes = can(member, "records.write");
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t.contacts.title}</h1>
          <p className="lede num">{plural(t.contacts.count, total, locale)}</p>
        </div>
        {writes && <NewContactButton label={t.contacts.new} initial={emptyContact(member.id)} fields={fields} team={team} me={member.id} canAssign={can(member, "assign")} canCreate={writes} today={today()} t={t} />}
      </div>
      <ListFilters label={t.contacts.filter} tags={tags} team={team} me={member.id} stale fields={fields} today={today()} sorts={[{ value: "name", label: t.contacts.sorts.name }, { value: "last", label: t.contacts.sorts.last }, { value: "created", label: t.contacts.sorts.created }]} t={t} />
      {filter.stale && <p className="notice">{t.contacts.staleHint}</p>}
      <BulkProvider>
        <div className="list-summary">
          {writes ? <PageCheck ids={rows.map(r => r.id)} total={total} table="contacts" filter={filter} locale={locale} t={t} /> : <span />}
          <span className="row">
            <a className="link-button" href={`/chest/export/contacts${query ? "?" + query : ""}`} download><Download />{t.common.exportCsv}</a>
            <a className="link-button" href={`/chest/export/vcf${query ? "?" + query : ""}`} download><Card />{t.contacts.exportVcf}</a>
          </span>
        </div>
        {writes && <BulkBar table="contacts" team={team} me={member.id} canAssign={can(member, "assign")} canDelete locale={locale} t={t} />}
        {rows.length === 0 ? (
          <EmptyState
            title={filtered ? t.contacts.emptyFiltered : t.contacts.empty}
            body={filtered ? undefined : t.contacts.emptyBody}
            action={!filtered && can(member, "import") ? <Link prefetch={false} className="button quiet" href="/chest/import">{t.shell.import}</Link> : undefined}
          />
        ) : (
          <ul className={`rows${writes ? " selectable" : ""}`}>
            {rows.map(c => {
              const state = c.step ? dueState(c.step.due, now) : null;
              return (
                <li key={c.id}>
                  {writes && <RowCheck id={c.id} label={format(t.common.bulk.select, { name: c.name })} />}
                  <Link prefetch={false} className="row-link" href={`/chest/contacts/${c.id}`}>
                    <span className="row-main">
                      <span className="row-title">{c.name}</span>
                      <span className="row-sub">{[c.title, c.company?.name].filter(Boolean).join(" · ")}{c.email ? <span className="mono-sub">{c.email}</span> : null}</span>
                    </span>
                    <span className="row-figures">
                      {c.step ? <span className={`due ${state}`}>{c.step.text} · {dueLabel(c.step, now, locale, t)}{c.steps > 1 ? ` · +${c.steps - 1}` : ""}</span> : null}
                    </span>
                    <span className="row-when muted" title={t.contacts.lastContact}>{c.lastContact ? relative(c.lastContact, locale) : t.contacts.never}</span>
                    <span className="row-owner">{c.owner ? <Avatar name={owners[c.owner]?.name ?? "?"} photo={owners[c.owner]?.photo ?? null} size="s" label={owners[c.owner]?.name ?? t.people.unknown} /> : <Avatar name="?" size="s" className="avatar-none" label={t.common.unassigned} />}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </BulkProvider>
      <Pager path="/chest/contacts" params={kept} page={page} pageSize={pageSize} total={total} locale={locale} t={t} />
    </div>
  );
}
