// Safe in the browser: no SDK here.
// A request's state as the kit's StatusBadge shows it: its tone gives the
// shape and the colour, the catalogue's word goes with it (never the colour
// alone — in the Chest theme states have no colour at all).
export type Shown = "pending" | "approved" | "refused" | "cancelled" | "cancelAsked" | "declared";
export type Tone = "ok" | "wait" | "danger" | "info" | "neutral";

const tones: Record<Shown, Tone> = {
  pending: "wait",
  cancelAsked: "wait",
  approved: "ok",
  declared: "ok",
  refused: "danger",
  cancelled: "neutral",
};

export function toneOf(status: Shown): Tone {
  return tones[status];
}
