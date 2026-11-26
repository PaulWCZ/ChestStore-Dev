import type { ToolEvent } from "@argentic/chest-sdk/events";
import type { Sql } from "./db.ts";
import { tickAbout, type Ticked } from "./journeys.ts";
import { memberPattern } from "../shared/model.ts";

// Equipment → People (Proposal (studio): events between tools). When
// someone is leaving (People tells Equipment: people.leaving), Equipment
// lists what they hold; once everything is back, it tells People, and the
// leaving checklist's "Return the laptop, badge and keys" step ticks
// itself — marked as ticked by Equipment. The contract, v1, which
// Equipment must publish (People's README, "With the other tools"):
//
//   equipment.returned  { member: "mbr_…" }   — everything this person held is back
//
// Only the example step does (its words' key, `offboarding.equipment`, is
// kept until HR rewords it): a step HR wrote itself is HR's to tick. An
// event of another shape, or from another tool, changes nothing; told
// twice, the second finds nothing left to tick.

export const returnPhrase = "offboarding.equipment";
export const tickedByEquipment = "equipment";

export function readReturned(data: Record<string, unknown>): { member: string } | null {
  const member = data["member"];
  return typeof member === "string" && memberPattern.test(member) ? { member } : null;
}

export async function equipmentReturned(sql: Sql, event: ToolEvent): Promise<Ticked[]> {
  if (event.source !== "equipment") return [];
  const told = readReturned(event.data);
  if (!told) return [];
  return tickAbout(sql, told.member, returnPhrase, tickedByEquipment);
}
