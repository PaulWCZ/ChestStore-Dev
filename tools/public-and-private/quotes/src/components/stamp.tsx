import { StatusBadge, type Tone } from "@argentic/chest-ui/components";
import type { State } from "../lib/documents.ts";

// A document's state, as a rubber stamp on the margin: the kit's
// StatusBadge (a shape and a word, never colour alone), inked as a stamp
// by app/globals.css (.stamp). Waiting states are ink; done is the look's
// "ok", late or refused its "danger"; a draft is dashed, what no longer
// counts is struck through.
const tones: Record<State, Tone> = {
  draft: "neutral", sent: "neutral", unpaid: "neutral", final: "neutral", expired: "neutral", credited: "neutral",
  accepted: "ok", paid: "ok", partly_paid: "wait", overdue: "danger", refused: "danger",
};

export function Stamp({ state, label, big = false }: { state: State; label: string; big?: boolean }) {
  return <StatusBadge className={`stamp ${state}${big ? " big" : ""}`} tone={tones[state]} label={label} size={big ? "m" : "s"} />;
}
