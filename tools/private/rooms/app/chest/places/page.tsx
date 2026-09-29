import { can } from "../../../lib/access.ts";
import { context } from "../../../lib/context.ts";
import { directory } from "../../../lib/directory.ts";
import { chestGroups } from "../../../lib/groups.ts";
import { nameOf, people } from "../../../lib/people.ts";
import { PlacesView } from "./places-view.tsx";

// The offices as an admin builds them: floors, meeting rooms, desk areas
// and desks, each changed in place.
export default async function Places({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const c = await context(params);
  if (!c || !can(c.member, "places.manage")) return null;
  const { locale, t, office } = c;
  const [everyone, groups] = await Promise.all([directory(), chestGroups()]);
  const assigned = c.offices.flatMap(o => o.floors.flatMap(f => f.areas.flatMap(a => a.desks.flatMap(d => (d.assignedTo ? [d.assignedTo] : [])))));
  const who = await people(assigned);
  const names: Record<string, string> = Object.fromEntries(assigned.map(id => [id, nameOf(who.get(id), locale)]));
  for (const p of everyone) names[p.id] ??= p.name;
  return (
    <PlacesView
      offices={c.offices.map(o => ({ id: o.id, name: o.name, address: o.address }))}
      office={office}
      people={everyone.map(p => ({ id: p.id, name: p.name }))}
      groups={groups}
      names={names}
      locale={locale}
      t={{ places: t.places, equipment: t.equipment, features: t.features, errors: t.errors, rooms: t.rooms, booking: t.booking }}
    />
  );
}
