import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { createCycle } from "../../src/lib/cycles.ts";
import { quarterOf } from "../../src/lib/model.ts";
import { createObjective } from "../../src/lib/objectives.ts";
import { addGroupTeam, addTeam } from "../../src/lib/teams.ts";
import { today } from "../../src/lib/time.ts";
import { testDatabase, type TestDatabase } from "./db.ts";
import { asMember } from "./member.ts";
import { camille, everyone, groups, hugo, ines, sofia } from "./members.ts";

// A company for the service tests: the fake Chest with its groups (Sales:
// Inès and Hugo; Office: Camille and Sofia), a database, and helpers that
// set up a cycle running today with teams. The fake Chest refuses any
// outbound host (network: {}), as the Chest's egress does.
export type World = { database: TestDatabase; chest: FakeChest; close(): Promise<void> };

export async function world(options: { mail?: boolean; groups?: boolean } = {}): Promise<World> {
  const chest = await fakeChest({
    tool: "goals",
    network: {},
    members: everyone,
    former: [{ id: "mbr_paul" + "a".repeat(22), name: "Paul Lefèvre" }],
    groups: [
      { id: groups.sales, name: "Sales", members: [ines.id, hugo.id] },
      { id: groups.office, name: "Office", members: [camille.id, sofia.id] },
      // A group that does not give Goals: seen only with "groups": "read".
      { id: "grp_warehouseaaaaaaaaaaaaaaaaa", name: "Warehouse", members: [hugo.id], grants: false },
    ],
    capabilities: ["members", "notifications", ...(options.mail === false ? [] : ["mail" as const]), ...(options.groups ? ["groups" as const] : [])],
    mail: { domain: "atelier-martin.test" },
    chest: { timeZone: "Europe/Paris", organization: "Atelier Martin", currency: "EUR", language: "fr", publicUrl: null },
  });
  const database = await testDatabase();
  return { database, chest, async close() { await database.close(); await chest.close(); } };
}

// The quarter running today, current; the teams Sales (a group) and
// Workshop (a name).
export async function running(w: World) {
  const { sql } = w.database;
  const admin = asMember(camille);
  const q = quarterOf(today());
  const cycle = await createCycle(sql, admin, { ...q, current: true });
  const sales = await addGroupTeam(sql, admin, groups.sales);
  const workshop = await addTeam(sql, admin, "Workshop");
  return { cycle, sales, workshop };
}

export async function companyObjective(w: World, cycleId: string, title = "Win 20 new customers") {
  return createObjective(w.database.sql, asMember(camille), {
    cycleId, level: "company", title, why: "The new machine.",
    keyResults: [{ title: "Customers signed", kind: "number", unit: "customers", start: "0", target: "20", owner: ines.id }, { title: "Website live", kind: "milestone", owner: hugo.id }],
  });
}
