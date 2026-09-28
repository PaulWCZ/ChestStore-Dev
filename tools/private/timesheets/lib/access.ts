import type { Member } from "@argentic/chest-sdk/member";

// Who may do what, in one place. The roles are chest.json's, strongest
// first; the owner, the admins and the tool's builders enter with the first.
//
// - manager: clients, projects, tasks, rates and budgets, who works on
//   what; everyone's reports and exports; locking a period; imports; the
//   tool's settings. Records their own time like everyone.
// - member: records their own time (timer, week, day) on the projects open
//   to them; sees their own reports.
//
// Nobody changes another person's time: a manager reads it in the reports.
export const roles = ["manager", "member"] as const;
export type Role = (typeof roles)[number];

export type Ability =
  | "time.own"
  | "projects.manage"
  | "projects.all"
  | "reports.all"
  | "lock"
  | "import"
  | "settings";

const grants: Record<Role, readonly Ability[]> = {
  manager: ["time.own", "projects.manage", "projects.all", "reports.all", "lock", "import", "settings"],
  member: ["time.own"],
};

export function roleOf(actor: Member | null): Role | null {
  const role = actor?.role;
  return role !== null && role !== undefined && (roles as readonly string[]).includes(role) ? role as Role : null;
}

export function can(actor: Member | null, ability: Ability): boolean {
  const role = roleOf(actor);
  return role !== null && grants[role].includes(ability);
}

// A project is open to a person when it is not archived and it is open to
// everyone, or they are named on it; a manager may record time on every
// open project.
export function offered(actor: Member | null, project: { archived: boolean; everyone: boolean; people: readonly string[] }): boolean {
  if (!actor || !can(actor, "time.own") || project.archived) return false;
  return project.everyone || can(actor, "projects.all") || project.people.includes(actor.id);
}
