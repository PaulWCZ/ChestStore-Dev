import { StatusBadge } from "@argentic/chest-ui/components";

// A deal's stage as a badge: an open stage is a plain tinted word; Won and
// Lost carry the state's shape and colour too (never colour alone — in a
// theme without state colours, the shape and the word still tell).
const tones = { open: "info", won: "ok", lost: "danger" } as const;

export function StageBadge({ kind, name }: { kind: "open" | "won" | "lost"; name: string }) {
  return <StatusBadge tone={tones[kind]} label={name} size="s" {...(kind === "open" ? { icon: false as const } : {})} />;
}
