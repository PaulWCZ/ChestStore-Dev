import type { Member } from "@argentic/chest-sdk/member";

// Who may do what, in one place. The roles are chest.json's, strongest
// first; the owner, the admins and the tool's builders enter with the first.
//
// - hr: the settings and leave types, everyone's balances (adjustments,
//   opening balances, import), every request's answer, the payroll export.
// - manager: answers the requests of the people HR made them the approver
//   of, sees those people's balances and the kind of their absences.
// - employee: asks for leave, follows their requests and balances, sees who
//   is away (never why: colleagues see "Away", not the kind of leave).
//
// Everyone with a role asks for their own leave. A resource the actor may
// not see does not exist for them (not_found), never "forbidden".
export const roles = ["hr", "manager", "employee"] as const;
export type Role = (typeof roles)[number];

export function roleOf(actor: Member | null): Role | null {
  const role = actor?.role;
  return role !== null && role !== undefined && (roles as readonly string[]).includes(role) ? role as Role : null;
}

export type Ability =
  | "request" // ask for leave for oneself
  | "calendar" // see who is away
  | "approve" // answer requests (of their people; HR: anyone's)
  | "approve.any"
  | "people.team" // see the balances of the people they approve
  | "people.all" // see and change everyone's balances, approvers, start dates
  | "settings" // the company's rules and the leave types
  | "export"; // the payroll export

const grants: Record<Role, readonly Ability[]> = {
  hr: ["request", "calendar", "approve", "approve.any", "people.team", "people.all", "settings", "export"],
  manager: ["request", "calendar", "approve", "people.team"],
  employee: ["request", "calendar"],
};

export function can(actor: Member | null, ability: Ability): boolean {
  const role = roleOf(actor);
  return role !== null && grants[role].includes(ability);
}

// Who may be named someone's approver: a person whose role answers requests.
export const approverRoles: readonly Role[] = ["hr", "manager"];
export const canBeApprover = (role: string | null | undefined): boolean => (approverRoles as readonly string[]).includes(role ?? "");

// What the actor may see of one person's leave: "own" (theirs), "approver"
// (HR, or the manager HR named their approver), or "team" (only that they
// are away, not why).
export type Sight = "own" | "approver" | "team";

export function sightOf(actor: Member | null, person: { memberId: string; approverId: string | null }): Sight | null {
  const role = roleOf(actor);
  if (!actor || role === null) return null;
  if (person.memberId === actor.id) return "own";
  if (role === "hr") return "approver";
  if (role === "manager" && person.approverId === actor.id) return "approver";
  return "team";
}

// mayDecide: may the actor answer a request of this person? HR answers
// anyone's but their own — unless no other HR person exists (the owner of a
// small company); a manager answers those they approve, never their own.
export function mayDecide(actor: Member | null, person: { memberId: string; approverId: string | null }, soleHr: boolean): boolean {
  const role = roleOf(actor);
  if (!actor || role === null || !can(actor, "approve")) return false;
  if (person.memberId === actor.id) return role === "hr" && soleHr && person.approverId === null;
  if (role === "hr") return true;
  return person.approverId === actor.id;
}
