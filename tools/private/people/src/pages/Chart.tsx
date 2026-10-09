import { Island, type PageContext, type View } from "@argentic/chest-app";
import { Avatar, EmptyState, PageHeader } from "@argentic/chest-ui/components";
import { Tree, Upload } from "../components/icons.tsx";
import { can } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { departedManagers, directory } from "../lib/directory.ts";
import { offlineStaff } from "../lib/offline.ts";
import { today } from "../lib/zone.ts";
import { orgChart, type OrgNode } from "../shared/tree.ts";
import type { ChartNode } from "../islands/OrgChart.tsx";

// The org chart, drawn from each person's manager: top-down trees that fold
// open and shut; on a phone, an indented list. Those without a place yet
// are listed below it.
export async function chartPage({ member, locale, t }: PageContext): Promise<View> {
  const sql = db();
  const { entries } = await directory(sql, member);
  // Managers who left keep their place above their reports, marked, until
  // HR names someone else.
  // Staff without the Chest have their place from their HR record (team,
  // manager), marked; HR's card opens the record, anyone else's nothing.
  type Place = { id: string; name: string; photo: string | null; title: string; team: string; managerId: string | null; left: boolean; href: string | null; offline: boolean };
  const records = can(member, "records.manage");
  const places: Place[] = [
    ...entries.map(e => ({ id: e.id, name: e.name, photo: e.photo, title: e.title, team: e.team, managerId: e.managerId, left: false, href: `/chest/people/${e.id}`, offline: false })),
    ...(await departedManagers(sql, entries)).map(d => ({ id: d.id, name: d.name || t.people.erased, photo: null, title: "", team: "", managerId: d.managerId, left: true, href: null, offline: false })),
    ...(await offlineStaff(sql, member, today())).map(o => ({ id: o.id, name: o.name, photo: null, title: o.title, team: o.team, managerId: o.managerId, left: false, href: records ? `/chest/records/${o.recordId}` : null, offline: true })),
  ];
  const { roots, alone } = orgChart(places);
  const shape = (n: OrgNode<Place>): ChartNode => ({
    id: n.person.id, name: n.person.name, photo: n.person.photo, title: n.person.title, team: n.person.team, size: n.size, left: n.person.left, href: n.person.href, offline: n.person.offline, reports: n.reports.map(shape),
  });
  const hr = can(member, "profile.job");
  return {
    title: t.chart.title,
    body: (
      <div className="page wide">
        <PageHeader title={t.chart.title} />
        {roots.length === 0 ? (
          <EmptyState
            icon={<Tree />}
            title={t.chart.empty.title}
            body={hr ? t.chart.empty.hr : t.chart.empty.body}
            action={can(member, "directory.import") ? <a className="button" href="/chest/import"><Upload />{t.chart.empty.action}</a> : null}
          />
        ) : (
          <Island name="OrgChart" props={{ roots: roots.map(shape), me: member.id, hr, locale, t: { reports: t.chart.reports, hide: t.chart.hide, show: t.chart.show, left: t.chart.left, leftHr: t.chart.leftHr, offline: t.chart.offline } }} />
        )}
        {roots.length > 0 && alone.length > 0 && (
          <section className="alone" aria-labelledby="alone-title">
            <h2 id="alone-title" className="eyebrow">{t.chart.alone}</h2>
            <p className="muted small">{hr ? t.chart.aloneHr : t.chart.aloneMember}</p>
            <ul className="minis inline">
              {alone.map(p => (
                <li key={p.id}>
                  {p.offline ? (
                    p.href ? (
                      <a className="mini" href={p.href}>
                        <Avatar name={p.name} photo={null} size="l" />
                        <span><strong>{p.name}</strong><span className="offline-tag">{t.chart.offline}</span>{p.title && <span className="muted">{p.title}</span>}</span>
                      </a>
                    ) : (
                      <div className="mini">
                        <Avatar name={p.name} photo={null} size="l" />
                        <span><strong>{p.name}</strong><span className="offline-tag">{t.chart.offline}</span>{p.title && <span className="muted">{p.title}</span>}</span>
                      </div>
                    )
                  ) : (
                    <a className="mini" href={hr ? `/chest/people/${p.id}/edit` : `/chest/people/${p.id}`}>
                      <Avatar name={p.name} photo={p.photo} size="l" />
                      <span><strong>{p.name}</strong>{p.title && <span className="muted">{p.title}</span>}</span>
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    ),
  };
}
