import type { Priority } from "../lib/model.ts";
import { Clock, Down, Flag, Up } from "./icons.tsx";

// A ticket's priority, in words with its sign (never colour alone):
// nothing for normal, a flag for urgent (outlined in red, not filled: it
// stands out without shouting), a chevron up for high, down for low.
export function PriorityChip({ priority, label }: { priority: Priority; label: string }) {
  if (priority === "normal") return null;
  return <span className={`chip prio ${priority}`}>{priority === "urgent" ? <Flag /> : priority === "high" ? <Up /> : <Down />}{label}</span>;
}

// How long the customer has waited for an answer; past the team's
// threshold, in the customer's colour, bold, and said to screen readers.
export function Waiting({ text, late, lateText }: { text: string; late: boolean; lateText: string }) {
  return <span className={`wait${late ? " late" : ""}`}><Clock />{text}{late && <span className="visually-hidden"> ({lateText})</span>}</span>;
}
