// Safe in the browser: no SDK here.
// The org chart, from each person's manager: trees of people who manage
// someone, top-down, and those not placed yet (no manager, nobody to
// manage). A manager who is not in the directory (gone, no access) is no
// one's manager here. The server refuses loops; a loop in old data is cut
// where it is found, never followed forever.
export type OrgNode<T> = { person: T; reports: OrgNode<T>[]; size: number };

export function orgChart<T extends { id: string; managerId: string | null }>(people: readonly T[]): { roots: OrgNode<T>[]; alone: T[] } {
  const byId = new Map(people.map(p => [p.id, p]));
  const reportsOf = new Map<string, T[]>();
  for (const p of people) {
    if (p.managerId && p.managerId !== p.id && byId.has(p.managerId)) reportsOf.set(p.managerId, [...(reportsOf.get(p.managerId) ?? []), p]);
  }
  const placed = new Set<string>();
  const grow = (person: T): OrgNode<T> => {
    placed.add(person.id);
    const reports = (reportsOf.get(person.id) ?? []).filter(r => !placed.has(r.id)).map(grow);
    return { person, reports, size: reports.reduce((n, r) => n + r.size, 1) };
  };
  const tops = people.filter(p => !p.managerId || p.managerId === p.id || !byId.has(p.managerId));
  const roots: OrgNode<T>[] = [];
  const alone: T[] = [];
  for (const p of tops) {
    if ((reportsOf.get(p.id) ?? []).length === 0) alone.push(p);
    else roots.push(grow(p));
  }
  // What no top reaches is a loop: it starts where the list first meets it.
  for (const p of people) if (!placed.has(p.id) && !alone.includes(p)) roots.push(grow(p));
  roots.sort((a, b) => b.size - a.size);
  return { roots, alone };
}
