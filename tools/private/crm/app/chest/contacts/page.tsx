import Link from "next/link";
import { Avatar } from "../../../components/avatar.tsx";
import { Card, Download } from "../../../components/icons.tsx";
import { can } from "../../../lib/access.ts";
import { companyChoices, tagsInUse } from "../../../lib/companies.ts";
import { listContacts } from "../../../lib/contacts.ts";
import { db } from "../../../lib/db.ts";
import { format, formatDay, plural, relative } from "../../../lib/i18n/index.ts";
import { dueState, today } from "../../../lib/model.ts";
import { directory } from "../../../lib/people.ts";
import { viewer } from "../../../lib/session.ts";
import { team as teamOf } from "../../../lib/team.ts";
import { NewContactButton } from "../ui/contact-form.tsx";
import { emptyContact } from "../ui/values.ts";
import { ListFilters } from "../ui/list-filters.tsx";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

// Every person, by name: where they work, their next step, when they were
// last in touch.
export default async function Contacts({ searchParams }: { searchParams: Search }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const params = await searchParams;
  const filter = { q: one(params["q"]), owner: one(params["owner"]), tag: one(params["tag"]), stale: one(params["stale"]) === "1" };
  const sql = db();
  const [{ rows, total }, tags, people, companies] = await Promise.all([listContacts(sql, member, filter), tagsInUse(sql, "contacts"), teamOf(), companyChoices(sql, member)]);
  const owners = await directory(rows.map(r => r.owner), locale);
  const now = today();
  const filtered = filter.q !== "" || filter.owner !== "" || filter.tag !== "" || filter.stale;
  const query = new URLSearchParams(Object.entries({ q: filter.q, owner: filter.owner, tag: filter.tag, stale: filter.stale ? "1" : "" }).filter(([, x]) => x !== "")).toString();
  const team = people.map(p => ({ id: p.id, name: p.name, photo: p.photo }));
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>{t.contacts.title}</h1>
          <p className="lede num">{plural(t.contacts.count, total, locale)}</p>
        </div>
        {can(member, "records.write") && <NewContactButton label={t.contacts.new} initial={emptyContact(member.id)} companies={companies} team={team} me={member.id} canAssign={can(member, "assign")} t={t} />}
      </div>
      <ListFilters label={t.contacts.filter} tags={tags} team={team} me={member.id} stale t={t} />
      {filter.stale && <p className="notice">{t.contacts.staleHint}</p>}
      <div className="list-summary">
        <span />
        <span className="row">
          <a className="link-button" href={`/chest/export/contacts${query ? "?" + query : ""}`} download><Download />{t.common.exportCsv}</a>
          <a className="link-button" href={`/chest/export/vcf${query ? "?" + query : ""}`} download><Card />{t.contacts.exportVcf}</a>
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="empty small">
          <h2>{filtered ? t.contacts.emptyFiltered : t.contacts.empty}</h2>
          {!filtered && <p>{t.contacts.emptyBody}</p>}
          {!filtered && can(member, "import") && <Link prefetch={false} className="button quiet" href="/chest/import">{t.shell.import}</Link>}
        </div>
      ) : (
        <ul className="rows">
          {rows.map(c => {
            const state = c.step ? dueState(c.step.due, now) : null;
            return (
              <li key={c.id}>
                <Link prefetch={false} className="row-link" href={`/chest/contacts/${c.id}`}>
                  <span className="row-main">
                    <span className="row-title">{c.name}</span>
                    <span className="row-sub">{[c.title, c.company?.name].filter(Boolean).join(" · ")}{c.email ? <span className="mono-sub">{c.email}</span> : null}</span>
                  </span>
                  <span className="row-figures">
                    {c.step ? <span className={`due ${state}`}>{c.step.text} · <span className="num">{c.step.due === now ? t.step.today : formatDay(c.step.due, locale)}</span></span> : null}
                  </span>
                  <span className="row-when num muted" title={t.contacts.lastContact}>{c.lastContact ? relative(c.lastContact, locale) : t.contacts.never}</span>
                  <span className="row-owner">{c.owner ? <Avatar name={owners[c.owner]?.name ?? "?"} photo={owners[c.owner]?.photo ?? null} size={26} title={owners[c.owner]?.name} /> : <span className="avatar empty-avatar" role="img" aria-label={t.common.unassigned} title={t.common.unassigned}>?</span>}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length < total && <p className="muted small-text">{format(t.common.showing, { shown: rows.length, total })}</p>}
    </main>
  );
}
