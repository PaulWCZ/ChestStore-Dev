import { allComponents, shownComponents } from "./components.ts";
import type { Query } from "./db.ts";

// The components a visitor may follow, named with their group: "Online
// shop — Checkout".
export async function followOptions(sql: Query): Promise<{ id: string; label: string }[]> {
  const all = await allComponents(sql);
  const groups = new Map(all.filter(c => c.kind === "group").map(g => [g.id, g]));
  const order = new Map(all.filter(c => c.parentId === null).map(c => [c.id, c.position]));
  return shownComponents(all)
    .sort((a, b) => (order.get(a.parentId ?? a.id) ?? 0) - (order.get(b.parentId ?? b.id) ?? 0) || (a.parentId === null ? -1 : a.position) - (b.parentId === null ? -1 : b.position))
    .map(c => ({ id: c.id, label: c.parentId && groups.get(c.parentId) ? `${groups.get(c.parentId)!.name} — ${c.name}` : c.name }));
}
