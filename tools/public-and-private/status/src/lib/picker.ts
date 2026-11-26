import { tree, type Component } from "./components.ts";

// The components an editor picks from, grouped as the page shows them;
// hidden ones included (an incident may touch what customers do not see),
// groups themselves are not picked.
export type PickerGroup = { id: string; name: string | null; items: { id: string; name: string }[] };

export function pickerGroups(list: Component[]): PickerGroup[] {
  const out: PickerGroup[] = [];
  let loose: PickerGroup | null = null;
  for (const e of tree(list)) {
    if (e.kind === "group") {
      loose = null;
      if (e.children.length) out.push({ id: e.id, name: e.name, items: e.children.map(c => ({ id: c.id, name: c.name })) });
    } else {
      if (!loose) {
        loose = { id: "loose-" + e.id, name: null, items: [] };
        out.push(loose);
      }
      loose.items.push({ id: e.id, name: e.name });
    }
  }
  return out;
}
