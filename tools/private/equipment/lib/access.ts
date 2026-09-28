import type { Member } from "@argentic/chest-sdk/member";

// Who may do what, in one place. The roles are chest.json's, strongest
// first; the owner, the admins and the tool's builders enter with the first.
//
// - manager: everything — add, edit, give, take back, labels, import,
//   export, categories, everyone's page, problems.
// - member: their own equipment ("Mine"), and a problem reported on what
//   they hold. They may also look through the catalogue, read-only and
//   without money, suppliers, notes or history: "who has the projector?"
//   and a found badge's owner are everyday questions in a small company.
//   A label scanned by a member opens that same short view.
export const roles = ["manager", "member"] as const;
export type Role = (typeof roles)[number];

export type Ability =
  | "items.browse"   // the catalogue, short view
  | "items.manage"   // everything about items, their full view, people's pages
  | "report";        // report a problem on what one holds

const grants: Record<Role, readonly Ability[]> = {
  manager: ["items.browse", "items.manage", "report"],
  member: ["items.browse", "report"],
};

export function roleOf(actor: Member | null): Role | null {
  const role = actor?.role;
  return role !== null && role !== undefined && (roles as readonly string[]).includes(role) ? role as Role : null;
}

export function can(actor: Member | null, ability: Ability): boolean {
  const role = roleOf(actor);
  return role !== null && grants[role].includes(ability);
}
