import * as chest from "@argentic/chest-sdk/chest";
import { EmptyState, PageHeader, SearchBox } from "@argentic/chest-ui/components";
import { headers } from "next/headers";
import { Inbox, Plus } from "../../components/icons.tsx";
import { FilterToggle } from "../../components/filter-toggle.tsx";
import { IncidentBanner } from "../../components/incident-banner.tsx";
import { InboxFilters } from "../../components/inbox-filters.tsx";
import { can } from "../../lib/access.ts";
import { openIncidents } from "../../lib/incidents-in.ts";
import { answerers, colleagueName } from "../../lib/tell.ts";
import { db } from "../../lib/db.ts";
import { workMinutes } from "../../lib/hours.ts";
import { format, plural, relative } from "../../lib/i18n/index.ts";
import { supportAddress } from "../../lib/mailer.ts";
import { defaultSort, isFolder, lateAfter, priorities, sorts, waitedFor, type Folder } from "../../lib/model.ts";
import { nameOf, people } from "../../lib/people.ts";
import { publicOrigin } from "../../lib/public-origin.ts";
import { viewer } from "../../lib/session.ts";
import { folderCounts, listTickets, rememberPublicOrigin, settings, tags as allTags } from "../../lib/tickets.ts";
import { listViews, viewHref, viewParams } from "../../lib/views.ts";
import { InboxList } from "./inbox-list.tsx";
import { RemoveView, SaveView } from "./save-view.tsx";

// The shared inbox: a folder of tickets, the most urgent first and, among
// equals, the customer who has waited longest (the one to answer next is
// on top), or the results of a search; filtered by priority or tag, sorted
// otherwise on demand. A tag without a folder shows every ticket carrying
// it. Tick tickets to change several at once.
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ folder?: string; q?: string; priority?: string; tag?: string; sort?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const search = await searchParams;
  const folder: Folder = isFolder(search.folder) ? search.folder : search.tag && !search.folder ? "all" : "unassigned";
  const q = (search.q ?? "").trim().slice(0, 100);
  const origin = publicOrigin(await headers());
  await rememberPublicOrigin(sql, origin);
  const filters = { priority: search.priority, tag: search.tag, sort: search.sort };
  const [rows, counts, tagList, s, incidents] = await Promise.all([listTickets(sql, member, folder, q || undefined, filters), folderCounts(sql, member), allTags(sql, member), settings(sql), openIncidents(sql, member, locale)]);
  const filtered = Boolean(search.priority || search.tag);
  const tagName = tagList.find(g => g.id === search.tag)?.name;
  const now = new Date();
  const zone = chest.timeZone();
  const canManage = can(member, "tickets.manage");
  const canCreate = can(member, "tickets.answer");
  const team = canManage ? await answerers() : [];
  const who = await people([...rows.flatMap(r => [r.assignee, r.requester]).filter((a): a is string => !!a && a.startsWith("mbr_")), ...team]);
  const total = counts.all + counts.spam;
  const address = total === 0 ? await supportAddress() : null;
  // A company that already has a contact form in Forms is shown the way.
  const forms = total === 0 ? chest.toolLink("forms", "/chest") : null;
  // The order shown by default is no choice of the view's.
  const current = viewParams({ ...search, sort: search.sort === defaultSort ? undefined : search.sort });
  const shown = (await listViews(sql, member)).find(x => viewHref(x.params) === viewHref(current));
  const savable = !shown && Boolean(current.q || current.priority || current.tag || current.sort);
  const w = t.inbox;
  const title = q ? t.shell.search : folder === "all" && tagName ? format(w.tagTitle, { tag: tagName }) : w.folders[folder];
  return (
    <>
      <PageHeader size="m" title={title} action={canCreate ? <a className="ck-button" href="/chest/new"><Plus />{t.shell.new}</a> : undefined} />
      <IncidentBanner incidents={incidents} t={t.incident} />
      {total > 0 && (
        <div className="inbox-tools">
          <SearchBox action="/chest" id="q" value={q} maxLength={100} labels={{ label: t.shell.search, placeholder: t.shell.search, shortcut: w.searchShortcut, submit: t.shell.searchButton }} />
          <FilterToggle label={w.filterButton} count={[search.priority, search.tag, search.sort && search.sort !== defaultSort ? search.sort : ""].filter(Boolean).length}>
          <div className="filters-line">
            <InboxFilters
              params={search}
              labels={{ label: w.filters, clear: w.showAll, all: w.any }}
              groups={[
                { key: "priority", label: w.priorityFilter, all: true, options: [...priorities].reverse().map(p => ({ value: p, label: t.priority[p] })) },
                ...(tagList.length > 0 ? [{ key: "tag", label: w.tagFilter, all: true, options: tagList.map(g => ({ value: g.id, label: g.name })) }] : []),
                { key: "sort", label: w.sortBy, required: true, value: defaultSort, options: sorts.map(o => ({ value: o, label: w.sorts[o] })) },
              ]}
            />
            {savable && canCreate && <SaveView params={current} t={{ inbox: w, dialog: t.dialog, errors: t.errors }} />}
            {shown && (shown.createdBy === member.id || can(member, "settings")) && <RemoveView id={shown.id} t={w} />}
          </div>
          </FilterToggle>
        </div>
      )}
      {q && <p className="muted results" role="status">{plural(w.results, rows.length, locale, { q })}</p>}
      {total === 0 && !q ? (
        <EmptyState icon={<Inbox />} title={w.firstTitle} body={format(w.firstBody, { email: address ? format(w.firstEmail, { email: address }) : "" })}
          action={<a className="ck-button" href={origin ?? "/"} target="_blank" rel="noopener">{w.openForm}</a>}
          note={forms && canCreate ? <a href={forms}>{w.formsNote}</a> : undefined} />
      ) : rows.length === 0 && !q ? (
        <EmptyState title={filtered ? w.filtered : w.empty[folder]} />
      ) : (
        <InboxList
          rows={rows.map(r => {
            const minutes = r.waitingSince ? workMinutes(r.waitingSince, now, s.hours, zone) : 0;
            const wt = waitedFor(minutes);
            return {
              number: r.number, subject: r.subject, status: r.status, priority: r.priority, tags: r.tags,
              customer: r.requester ? (r.requester === "erased" ? t.people.erased : colleagueName(who.get(r.requester), t, locale)) : r.customerName || r.customerEmail, last: r.last, lastKind: r.lastKind,
              assignee: r.assignee ? nameOf(who.get(r.assignee), locale).split(" ")[0]! : null,
              when: r.waitingSince ? null : relative(r.updatedAt, locale, now), updatedAt: r.updatedAt,
              waiting: r.waitingSince ? { text: plural(t.waiting[wt.unit], wt.count, locale), late: lateAfter(minutes, s.lateHours), lateText: format(t.waiting.late, { hours: s.lateHours }) } : null,
            };
          })}
          canManage={canManage}
          team={team.map(id => ({ id, name: nameOf(who.get(id), locale) }))}
          t={{ inbox: w, priority: t.priority, errors: t.errors, statuses: t.ticket.statuses }}
          locale={locale}
        />
      )}
    </>
  );
}
