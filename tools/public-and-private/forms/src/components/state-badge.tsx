import { StatusBadge, type Tone } from "@argentic/chest-ui/components";

// A form's state and an answer's follow-up as the kit's badges: a shape
// and a word, never the colour alone (in the Chest theme states have no
// colour at all).
const formTones: Record<string, Tone> = { open: "ok", draft: "wait", closed: "neutral", date: "neutral", full: "neutral" };
const followTones: Record<string, Tone> = { new: "info", doing: "wait", done: "ok" };

export function StateBadge({ state, label }: { state: string; label: string }) {
  return <StatusBadge tone={formTones[state] ?? "neutral"} label={label} size="s" />;
}

export function FollowBadge({ state, label }: { state: string; label: string }) {
  return <StatusBadge tone={followTones[state] ?? "neutral"} label={label} size="s" />;
}
