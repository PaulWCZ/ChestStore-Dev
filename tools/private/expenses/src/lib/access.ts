import type { Member } from "@argentic/chest-sdk/member";

// Who may do what, in one place. The roles are chest.json's, strongest
// first; the owner, the admins and the tool's builders enter with the first.
//
// - accountant: the company's settings (categories, mileage scale,
//   approvers), sees every expense that was sent, approves any of them,
//   marks them paid, exports. With no approver named for someone, the
//   accountants approve their expenses.
// - approver: approves or refuses the expenses of the people assigned to
//   them, and sees those.
// - employee: their own expenses.
//
// Everyone with a role adds and sends their own expenses. A draft is its
// owner's alone until it is sent. Nobody approves their own expense, ever:
// an accountant's own go to the approver named for them, or else to the
// other accountants; with neither, they wait (and the pages say so) until
// someone is named. The one who pays may be the one who approved (a small
// company's accountant often does both): "To pay back" says so on each
// line they approved themselves, for a second look before paying.
export const roles = ["accountant", "approver", "employee"] as const;
export type Role = (typeof roles)[number];

export type Ability = "own" | "approve" | "approve.all" | "see.all" | "settings" | "pay" | "export";

const grants: Record<Role, readonly Ability[]> = {
  accountant: ["own", "approve", "approve.all", "see.all", "settings", "pay", "export"],
  approver: ["own", "approve"],
  employee: ["own"],
};

export function roleOf(actor: Member | null): Role | null {
  const role = actor?.role;
  return role !== null && role !== undefined && (roles as readonly string[]).includes(role) ? role as Role : null;
}

export function can(actor: Member | null, ability: Ability): boolean {
  const role = roleOf(actor);
  return role !== null && grants[role].includes(ability);
}

// What one member may do with one expense: nothing (it does not exist for
// them), read it, decide on it (approve or refuse), or own it.
export type ExpenseFacts = { owner: string; status: string; approver: string | null; assignedTo: string | null };
export type ExpenseAccess = { see: boolean; own: boolean; decide: boolean };

export function expenseAccess(actor: Member | null, e: ExpenseFacts): ExpenseAccess {
  const none = { see: false, own: false, decide: false };
  if (!actor || roleOf(actor) === null) return none;
  const own = e.owner === actor.id;
  if (e.status === "draft") return own ? { see: true, own: true, decide: false } : none;
  // The approver named when it was sent, or the one named now.
  const approverOf = e.approver === actor.id || e.assignedTo === actor.id;
  const see = own || can(actor, "see.all") || (can(actor, "approve") && approverOf);
  if (!see) return none;
  let decide = false;
  // Never one's own: not even an accountant nobody else approves.
  if (e.status === "submitted" && !own) decide = can(actor, "approve.all") || (can(actor, "approve") && e.approver === actor.id);
  return { see, own, decide };
}
