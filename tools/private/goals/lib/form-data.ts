import type { Member } from "@argentic/chest-sdk/member";
import { can, inTeam, mayCreate } from "./access.ts";
import type { Query } from "./db.ts";
import type { Level } from "./model.ts";
import { cycleObjectives, type Clock } from "./read.ts";
import { settings, type Team } from "./teams.ts";

// What an objective form offers this person: the levels they may write,
// the teams (those they may write for marked), what the objective may
// support in that cycle.
export async function formChoices(sql: Query, actor: Member, cycleId: string, teamList: Team[], clock: Clock) {
  const { personal } = await settings(sql);
  const active = teamList.filter(x => !x.archived);
  const levels: Level[] = [];
  if (mayCreate(actor, "company", null, personal)) levels.push("company");
  if (active.some(x => mayCreate(actor, "team", x, personal)) || (active.length === 0 && can(actor, "team.write"))) levels.push("team");
  if (mayCreate(actor, "personal", null, personal)) levels.push("personal");
  const teams = active.map(x => ({ id: x.id, name: x.name, writable: can(actor, "any.write") || inTeam(actor, x) }));
  const objectives = await cycleObjectives(sql, cycleId, clock);
  const names = new Map(teamList.map(x => [x.id, x.name]));
  const parents = objectives.filter(o => o.level !== "personal").map(o => ({ id: o.id, title: o.title, level: o.level, team: o.teamId ? names.get(o.teamId) ?? null : null }));
  return { levels, teams, parents, personal };
}
