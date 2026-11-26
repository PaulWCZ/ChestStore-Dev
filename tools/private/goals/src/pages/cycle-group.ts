import type { FilterGroup } from "@argentic/chest-ui/components";
import type { Catalogue } from "../i18n/index.ts";

// The cycle a page shows, as the kit's filter group that always has one
// value: the most recent cycles (newest first), and the one shown if it is
// older. Older cycles stay one tap away from the Cycles page (their review).
const shown = 6;

export function cycleGroup(cycles: readonly { id: string; name: string; closed: boolean; current: boolean }[], value: string, t: Catalogue): FilterGroup {
  const recent = cycles.slice(0, shown);
  const chosen = cycles.find(c => c.id === value);
  const list = chosen && !recent.includes(chosen) ? [...recent, chosen] : recent;
  return {
    key: "cycle",
    label: t.cycle.label,
    required: true,
    value,
    options: list.map(c => ({ value: c.id, label: c.current ? `${c.name} · ${t.cycle.current}` : c.closed ? `${c.name} · ${t.cycle.closed}` : c.name })),
  };
}
