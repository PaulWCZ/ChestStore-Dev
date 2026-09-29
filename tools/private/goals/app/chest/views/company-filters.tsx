"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Shape } from "../../../components/icons.tsx";

export type Filters = { cycle: string; status: "" | "at_risk" | "off_track" | "quiet"; team: string; owner: string };
type Words = { filter: string; all: string; team: string; anyTeam: string; owner: string; anyOwner: string; show: string; clear: string; status: Record<"at_risk" | "off_track" | "quiet", string> };

// The company's tree, narrowed: by how it goes (at risk, off track, quiet),
// by team, by owner. Everything is in the address, so a filtered view is a
// link to share, and works without scripts (the selects' button).
export function CompanyFilters({ value, counts, teams, owners, t }: { value: Filters; counts: Record<"all" | "at_risk" | "off_track" | "quiet", number>; teams: { id: string; name: string }[]; owners: { id: string; name: string }[]; t: Words }) {
  const router = useRouter();
  const path = usePathname();
  const href = (patch: Partial<Filters>) => {
    const next = { ...value, ...patch };
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
    return `${path}?${q.toString()}`;
  };
  const active = value.status !== "" || value.team !== "" || value.owner !== "";
  return (
    <div className="filters" role="search" aria-label={t.filter}>
      <ul className="chips">
        <li><Link className={`chip${value.status === "" ? " on" : ""}`} aria-current={value.status === "" ? "true" : undefined} href={href({ status: "" })}>{t.all} <span className="n">{counts.all}</span></Link></li>
        {(["at_risk", "off_track", "quiet"] as const).map(s => (
          <li key={s}>
            <Link className={`chip${value.status === s ? " on" : ""}`} aria-current={value.status === s ? "true" : undefined} href={href({ status: s })}>
              {s !== "quiet" && <span className={`shape-${s}`}><Shape confidence={s} /></span>}{t.status[s]} <span className="n">{counts[s]}</span>
            </Link>
          </li>
        ))}
      </ul>
      <form method="get" action={path} className="selects" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); router.push(href({ team: String(f.get("team") ?? ""), owner: String(f.get("owner") ?? "") })); }}>
        <input type="hidden" name="cycle" value={value.cycle} />
        {value.status && <input type="hidden" name="status" value={value.status} />}
        {teams.length > 0 && (
          <label className="inline-field"><span className="visually-hidden">{t.team}</span>
            <select name="team" className="select" value={value.team} onChange={e => router.push(href({ team: e.target.value }))}>
              <option value="">{t.anyTeam}</option>
              {teams.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        )}
        <label className="inline-field"><span className="visually-hidden">{t.owner}</span>
          <select name="owner" className="select" value={value.owner} onChange={e => router.push(href({ owner: e.target.value }))}>
            <option value="">{t.anyOwner}</option>
            {owners.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <noscript><button type="submit" className="button quiet small">{t.show}</button></noscript>
        {active && <Link className="link-button" href={href({ status: "", team: "", owner: "" })}>{t.clear}</Link>}
      </form>
    </div>
  );
}
