import { chest } from "@argentic/chest-sdk/chest";
import { Island, type View } from "@argentic/chest-app";
import { EmptyState, PageHeader } from "@argentic/chest-ui/components";
import type { TeamContext } from "../app.tsx";
import { IncidentBanner } from "../components/incident-banner.tsx";
import { Inbox, Plus } from "../components/icons.tsx";
import { format, plural, relative } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { toolLink } from "../lib/forms-in.ts";
import { workMinutes } from "../shared/hours.ts";
import { openIncidents } from "../lib/incidents-in.ts";
import { defaultSort, isFolder, lateAfter, priorities, sorts, waitedFor, type Folder } from "../lib/model.ts";
import { nameOf, people } from "../lib/people.ts";
import { publicOrigin } from "../lib/public-origin.ts";
import { answerers, colleagueName } from "../lib/tell.ts";
import { folderCounts, listTickets, settings, tags as allTags } from "../lib/tickets.ts";
import { listViews, viewHref, viewParams } from "../lib/views.ts";

// The shared inbox, /chest: a folder of tickets, the most urgent first and,
// among equals, the customer who has waited longest (the one to answer next
// is on top), or the results of a search; filtered by priority or tag,
// sorted otherwise on demand. A tag without a folder shows every ticket
// carrying it. Tick tickets to change several at once (the InboxList
// island), search and filter above it (InboxTools).
export async function inboxPage({ sql, member, lang: locale, t, query, desk }: TeamContext): Promise<View> {
  const search = { folder: query("folder"), q: query("q"), priority: query("priority"), tag: query("tag"), sort: query("sort") };
  const folder: Folder = isFolder(search.folder) ? search.folder : search.tag && !search.folder ? "all" : "unassigned";
  const q = (search.q ?? "").trim().slice(0, 100);
  const origin = publicOrigin();
  const filters = { priority: search.priority, tag: search.tag, sort: search.sort };
  const [rows, counts, tagList, s, incidents, views] = await Promise.all([listTickets(sql, member, folder, q || undefined, filters), desk?.counts ?? folderCounts(sql, member), allTags(sql, member), settings(sql), openIncidents(sql, member, locale), desk?.views ?? listViews(sql, member)]);
  const filtered = Boolean(search.priority || search.tag);
  const tagName = tagList.find(g => g.id === search.tag)?.name;
  const now = new Date();
  const zone = chest.timeZone;
  const canManage = can(member, "tickets.manage");
  const canCreate = can(member, "tickets.answer");
  const team = canManage ? await answerers() : [];
  const who = await people([...rows.flatMap(r => [r.assignee, r.requester]).filter((a): a is string => !!a && a.startsWith("mbr_")), ...team]);
  const total = counts.all + counts.spam;
  // A company that already has a contact form in Forms is shown the way.
  const forms = total === 0 ? toolLink("forms", "/chest") : null;
  // The order shown by default is no choice of the view's.
  const current = viewParams({ ...search, sort: search.sort === defaultSort ? undefined : search.sort });
  const shown = views.find(x => viewHref(x.params) === viewHref(current));
  const savable = !shown && Boolean(current.q || current.priority || current.tag || current.sort);
  const w = t.inbox;
  const title = q ? t.shell.search : folder === "all" && tagName ? format(w.tagTitle, { tag: tagName }) : w.folders[folder];
  const params = Object.fromEntries(Object.entries(search).filter((e): e is [string, string] => typeof e[1] === "string"));
  return {
    title,
    body: (
      <>
        <PageHeader size="m" title={title} action={canCreate ? <a className="ck-button" href="/chest/new"><Plus />{t.shell.new}</a> : undefined} />
        <IncidentBanner incidents={incidents} t={t.incident} />
        {total > 0 && (
          <Island name="InboxTools" props={{
            q,
            params,
            filterCount: [search.priority, search.tag, search.sort && search.sort !== defaultSort ? search.sort : ""].filter(Boolean).length,
            groups: [
              { key: "priority", label: w.priorityFilter, all: true, options: [...priorities].reverse().map(p => ({ value: p, label: t.priority[p] })) },
              ...(tagList.length > 0 ? [{ key: "tag", label: w.tagFilter, all: true, options: tagList.map(g => ({ value: g.id, label: g.name })) }] : []),
              { key: "sort", label: w.sortBy, required: true, value: defaultSort, options: sorts.map(o => ({ value: o, label: w.sorts[o] })) },
            ],
            savable: savable && canCreate ? current : null,
            removable: shown && (shown.createdBy === member.id || can(member, "settings")) ? shown.id : null,
            t: {
              search: { label: t.shell.search, placeholder: t.shell.search, shortcut: w.searchShortcut, submit: t.shell.searchButton },
              filters: { label: w.filters, clear: w.showAll, all: w.any },
              filterButton: w.filterButton,
              saveView: w.saveView, viewName: w.viewName, viewSave: w.viewSave, viewSaved: w.viewSaved, viewRemoved: w.viewRemoved, removeView: w.removeView, cancel: w.cancel,
              dialog: t.kit.dialog,
            },
          }} />
        )}
        {q && <p className="muted results" role="status">{plural(w.results, rows.length, locale, { q })}</p>}
        {total === 0 && !q ? (
          <EmptyState icon={<Inbox />} title={w.firstTitle} body={w.firstBody}
            action={<a className="ck-button" href={origin ?? "/"} target="_blank" rel="noopener">{w.openForm}</a>}
            note={forms && canCreate ? <a href={forms}>{w.formsNote}</a> : undefined} />
        ) : rows.length === 0 && !q ? (
          <EmptyState title={filtered ? w.filtered : w.empty[folder]} />
        ) : (
          <Island name="InboxList" props={{
            rows: rows.map(r => {
              const minutes = r.waitingSince ? workMinutes(r.waitingSince, now, s.hours, zone) : 0;
              const wt = waitedFor(minutes);
              return {
                number: r.number, subject: r.subject, status: r.status, priority: r.priority, tags: r.tags,
                customer: r.requester ? (r.requester === "erased" ? t.people.erased : colleagueName(who.get(r.requester), t, locale)) : r.customerName || r.customerEmail,
                last: r.last, lastKind: r.lastKind,
                assignee: r.assignee ? nameOf(who.get(r.assignee), locale).split(" ")[0]! : null,
                when: r.waitingSince ? null : relative(r.updatedAt, locale, now), updatedAt: r.updatedAt,
                waiting: r.waitingSince ? { text: plural(t.waiting[wt.unit], wt.count, locale), late: lateAfter(minutes, s.lateHours), lateText: format(t.waiting.late, { hours: s.lateHours }) } : null,
                priorityLabel: t.priority[r.priority],
              };
            }),
            canManage,
            team: team.map(id => ({ id, name: nameOf(who.get(id), locale) })),
            priorities: [...priorities].reverse().map(p => ({ value: p, label: t.priority[p] })),
            t: {
              selectPage: w.selectPage, select: w.select, selected: w.selected, bulk: w.bulk, bulkAssign: w.bulkAssign, bulkNobody: w.bulkNobody, bulkPriority: w.bulkPriority,
              bulkTag: w.bulkTag, bulkTagPlaceholder: w.bulkTagPlaceholder, bulkApply: w.bulkApply, bulkClose: w.bulkClose, bulkSpam: w.bulkSpam, bulkClear: w.bulkClear,
              bulkDone: w.bulkDone, moreTags: w.moreTags, noteLast: w.noteLast, replyLast: w.replyLast, unassignedTag: w.unassignedTag,
            },
            locale,
          }} />
        )}
      </>
    ),
  };
}
