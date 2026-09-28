import Link from "next/link";
import { Tree, Upload } from "../../../components/icons.tsx";
import { Portrait } from "../../../components/portrait.tsx";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { directory } from "../../../lib/directory.ts";
import { viewer } from "../../../lib/session.ts";
import { orgChart, type OrgNode } from "../../../lib/tree.ts";
import { OrgChart, type ChartNode } from "./org-chart.tsx";

// The org chart, drawn from each person's manager: top-down trees that fold
// open and shut; on a phone, an indented list. Those without a place yet
// are listed below it.
export default async function ChartPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const { entries } = await directory(db(), member);
  const { roots, alone } = orgChart(entries);
  const shape = (n: OrgNode<(typeof entries)[number]>): ChartNode => ({
    id: n.person.id, name: n.person.name, photo: n.person.photo, title: n.person.title, team: n.person.team, size: n.size, reports: n.reports.map(shape),
  });
  const hr = can(member, "profile.job");
  return (
    <main className="page wide">
      <div className="page-head">
        <h1>{t.chart.title}</h1>
      </div>
      {roots.length === 0 ? (
        <div className="empty">
          <Tree />
          <h2>{t.chart.empty.title}</h2>
          <p>{hr ? t.chart.empty.hr : t.chart.empty.body}</p>
          {can(member, "directory.import") && <Link className="button" href="/chest/import"><Upload />{t.chart.empty.action}</Link>}
        </div>
      ) : (
        <OrgChart roots={roots.map(shape)} me={member.id} locale={locale} t={t.chart} />
      )}
      {roots.length > 0 && alone.length > 0 && (
        <section className="alone" aria-labelledby="alone-title">
          <h2 id="alone-title" className="eyebrow">{t.chart.alone}</h2>
          <p className="muted small">{hr ? t.chart.aloneHr : t.chart.aloneMember}</p>
          <ul className="minis inline">
            {alone.map(p => (
              <li key={p.id}>
                <Link className="mini" href={hr ? `/chest/people/${p.id}/edit` : `/chest/people/${p.id}`}>
                  <Portrait name={p.name} photo={p.photo} size={40} />
                  <span><strong>{p.name}</strong>{p.title && <span className="muted">{p.title}</span>}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
