import type { Sql } from "../../lib/db.ts";
import { addDays, nextWorkingDay, today, weekday } from "../../lib/model.ts";
import * as places from "../../lib/places.ts";
import { asMember } from "./member.ts";
import { camille } from "./members.ts";

export const zone = "Europe/Paris";

// A working day (Monday to Friday) at least n days after today.
export function workday(n = 1): string {
  return nextWorkingDay(addDays(today(zone), n), [1, 2, 3, 4, 5]);
}
// A weekend day after today.
export function weekend(): string {
  let d = addDays(today(zone), 1);
  while (weekday(d) < 6) d = addDays(d, 1);
  return d;
}

// An office as the sample has it: two floors, rooms Atlas (8) and Bora (4),
// an open space with four desks.
export async function office(sql: Sql, name = "Paris") {
  const admin = asMember(camille);
  const o = await places.addOffice(sql, admin, { name, address: "12 rue de Paradis" });
  const ground = await places.addFloor(sql, admin, o.id, "Ground floor");
  const first = await places.addFloor(sql, admin, o.id, "First floor");
  const atlas = await places.addRoom(sql, admin, ground.id, { name: "Atlas", capacity: 8, equipment: ["screen", "video"] });
  const bora = await places.addRoom(sql, admin, first.id, { name: "Bora", capacity: 4 });
  const open = await places.addArea(sql, admin, first.id, "Open space");
  const desks = await places.addDesks(sql, admin, open.id, 4, ["screen"]);
  return { office: o.id, ground: ground.id, first: first.id, atlas: atlas.id, bora: bora.id, area: open.id, desks: desks.ids };
}
