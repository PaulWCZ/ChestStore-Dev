import { StatusBadge, type Tone } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import type { Priority, Status } from "../shared/model.ts";
import { Clock, Down, Flag, Up } from "./icons.tsx";

// A ticket's priority, in the kit's badge: its word with its sign (never
// colour alone) — nothing for normal, a flag for urgent (the danger
// state), a chevron up for high, down for low.
export function PriorityChip({ priority, label }: { priority: Priority; label: string }) {
  if (priority === "normal") return null;
  const [tone, icon]: [Tone, ReactNode] = priority === "urgent" ? ["danger", <Flag key="f" />] : priority === "high" ? ["neutral", <Up key="u" />] : ["neutral", <Down key="d" />];
  return <StatusBadge tone={tone} icon={icon} label={label} size="s" />;
}

// A ticket's state, in the kit's badge (a shape and a word): open — the
// customer waits for us — in the warm "waiting" state, waiting for the
// customer in the calm "info", closed done, spam neutral.
const tones: Record<Status, Tone> = { open: "wait", waiting: "info", closed: "ok", spam: "neutral" };
export function StateBadge({ status, label }: { status: Status; label: string }) {
  return <StatusBadge tone={tones[status]} label={label} size="s" />;
}

// How long the customer has waited for an answer; past the team's
// threshold, on the customer's coral (the categorical slot 3, with its
// ink), bold, and said to screen readers.
export function Waiting({ text, late, lateText }: { text: string; late: boolean; lateText: string }) {
  return <span className={`wait${late ? " late" : ""}`}><Clock />{text}{late && <span className="visually-hidden"> ({lateText})</span>}</span>;
}
