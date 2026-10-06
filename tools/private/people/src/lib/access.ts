import type { Member } from "@argentic/chest-sdk/member";

// Who may do what, in one place. The roles are chest.json's, strongest
// first; the owner, the admins and the tool's builders enter with the first.
//
// - hr: everything members do, and edits everyone's job fields (title,
//   team, office, manager, start date, work phone), the checklist
//   templates, starts and follows every onboarding and offboarding, ticks
//   any item, imports and exports the directory, and keeps the employee
//   records (contract, staff register, emergency contact, documents).
// - member: reads the directory and the org chart, edits their own profile
//   (phone, pronouns, bio, "ask me about", birthday), does the checklist
//   items given to them and follows the checklists they take part in;
//   reads their own employee record (never anyone else's — a manager
//   sees nothing of their reports' records).
export const roles = ["hr", "member"] as const;
export type Role = (typeof roles)[number];

export type Ability =
  | "directory.read"
  | "profile.own"
  | "profile.job"
  | "checklists.manage"
  | "directory.import"
  | "directory.export"
  | "records.manage";

const grants: Record<Role, readonly Ability[]> = {
  hr: ["directory.read", "profile.own", "profile.job", "checklists.manage", "directory.import", "directory.export", "records.manage"],
  member: ["directory.read", "profile.own"],
};

export function roleOf(actor: Member | null): Role | null {
  const role = actor?.role;
  return role !== null && role !== undefined && (roles as readonly string[]).includes(role) ? role as Role : null;
}

export function can(actor: Member | null, ability: Ability): boolean {
  const role = roleOf(actor);
  return role !== null && grants[role].includes(ability);
}

// Who sees one checklist: HR, the person it is about, their manager, and
// anyone with an item in it. Others are told it does not exist.
export function seesJourney(actor: Member | null, journey: { personId: string | null; managerId: string | null; assignees: string[] }): boolean {
  if (!actor || roleOf(actor) === null) return false;
  if (can(actor, "checklists.manage")) return true;
  return (journey.personId !== null && journey.personId === actor.id) || journey.managerId === actor.id || journey.assignees.includes(actor.id);
}

// Who ticks one item: whoever it is given to, and HR.
export function ticks(actor: Member | null, item: { assignee: string | null }): boolean {
  if (!actor || roleOf(actor) === null) return false;
  return can(actor, "checklists.manage") || item.assignee === actor.id;
}

// What one employee record allows: HR edits it; the person it is about
// reads it; anyone else is told it does not exist.
export function recordAccess(actor: Member | null, record: { memberId: string | null }): "edit" | "read" | null {
  if (!actor || roleOf(actor) === null) return null;
  if (can(actor, "records.manage")) return "edit";
  return record.memberId !== null && record.memberId === actor.id ? "read" : null;
}
