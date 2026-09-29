import type { Member } from "@argentic/chest-sdk/member";

// Who may do what, in one place. The roles are chest.json's, strongest
// first; the owner, the admins and the tool's builders enter with the first.
//
// - manager: everything — add, edit, give, take back, labels, import,
//   export, categories, everyone's page, problems.
// - member: their own equipment ("Mine"): say "I received it", report a
//   problem on what they hold, ask for something (a request), print their
//   own handover sheet. They may also look through the catalogue, read-only and
//   without money, suppliers, notes or history: "who has the projector?"
//   and a found badge's owner are everyday questions in a small company.
//   A label scanned by a member opens that same short view.
export const roles = ["manager", "member"] as const;
export type Role = (typeof roles)[number];

export type Ability =
  | "items.browse"   // the catalogue, short view
  | "items.manage"   // everything about items, their full view, people's pages
  | "report"         // report a problem on what one holds
  | "request";       // ask for equipment

const grants: Record<Role, readonly Ability[]> = {
  manager: ["items.browse", "items.manage", "report", "request"],
  member: ["items.browse", "report", "request"],
};

export function roleOf(actor: Member | null): Role | null {
  const role = actor?.role;
  return role !== null && role !== undefined && (roles as readonly string[]).includes(role) ? role as Role : null;
}

export function can(actor: Member | null, ability: Ability): boolean {
  const role = roleOf(actor);
  return role !== null && grants[role].includes(ability);
}
