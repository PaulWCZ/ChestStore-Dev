import { StatusBadge } from "@argentic/chest-ui/components";
import type { Kind } from "../lib/model.ts";

// Arrival or departure: a category chip of the kit (its word tells it; the
// colour follows the theme: slot 2, green, for an arrival; slot 8, slate,
// for a departure).
export function KindBadge({ kind, label }: { kind: Kind; label: string }) {
  return <StatusBadge size="s" category={kind === "onboarding" ? 2 : 8} label={label} />;
}
