import type { Member } from "@argentic/chest-sdk/member";
import type { Level } from "./model.ts";

// Who may do what, in one place. The roles are chest.json's, strongest
// first; the owner, the admins and the tool's builders enter with the first.
//
// - admin: cycles, company objectives, teams and settings; may change any
//   objective, key result or comment, check in for anyone, reassign.
// - member: writes team objectives (of the teams they are in: a Chest
//   group's members, or anyone for a team named in the tool) and, when the
//   settings allow it, personal ones (their own); edits what they own;
//   checks in on their key results; comments everywhere.
//
// Everyone with a role reads everything: objectives are shared by design.
export const roles = ["admin", "member"] as const;
export type Role = (typeof roles)[number];

export function roleOf(actor: Member | null): Role | null {
  const role = actor?.role;
  return role !== null && role !== undefined && (roles as readonly string[]).includes(role) ? role as Role : null;
}

export type Ability = "read" | "comment" | "cycles.manage" | "settings.manage" | "company.write" | "team.write" | "personal.write" | "any.write";

const grants: Record<Role, readonly Ability[]> = {
  admin: ["read", "comment", "cycles.manage", "settings.manage", "company.write", "team.write", "personal.write", "any.write"],
  member: ["read", "comment", "team.write", "personal.write"],
};

export function can(actor: Member | null, ability: Ability): boolean {
  const role = roleOf(actor);
  return role !== null && grants[role].includes(ability);
}

export type TeamRef = { groupId: string | null; archived: boolean };

// A member writes for a team they are in: a Chest group's members; anyone
// for a team named in the tool (the company has no such group).
export function inTeam(actor: Member | null, team: TeamRef): boolean {
  if (!actor) return false;
  return team.groupId === null || actor.groups.includes(team.groupId);
}

// Whether the actor may create an objective of that level (and team).
export function mayCreate(actor: Member | null, level: Level, team: TeamRef | null, personalOn: boolean): boolean {
  if (!actor || !can(actor, "read")) return false;
  if (level === "company") return can(actor, "company.write");
  if (level === "personal") return personalOn && can(actor, "personal.write");
  if (!team || team.archived || !can(actor, "team.write")) return false;
  return can(actor, "any.write") || inTeam(actor, team);
}

// An objective is changed (title, key results, owner, retrospective) by its
// owner or an admin.
export function mayEdit(actor: Member | null, objective: { owner: string }): boolean {
  if (!actor || !can(actor, "read")) return false;
  return can(actor, "any.write") || objective.owner === actor.id;
}

// A key result's check-ins: its owner, or an admin.
export function mayCheckIn(actor: Member | null, keyResult: { owner: string }): boolean {
  if (!actor || !can(actor, "read")) return false;
  return can(actor, "any.write") || keyResult.owner === actor.id;
}
