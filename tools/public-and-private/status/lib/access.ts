import type { Member } from "@argentic/chest-sdk/member";

// Who may do what, in one place. Status has one role: an editor runs the
// status page — components, incidents, maintenance, subscribers. The owner,
// the admins and the tool's builders enter with it. Anyone who has the tool
// without a role sees nothing of it but a page that says so (the public
// page is open to everyone anyway).
export const roles = ["editor"] as const;
export type Role = (typeof roles)[number];
export type Ability = "read" | "incidents" | "components" | "subscribers";

const grants: Record<Role, readonly Ability[]> = {
  editor: ["read", "incidents", "components", "subscribers"],
};

export function roleOf(actor: Member | null): Role | null {
  const role = actor?.role;
  return role !== null && role !== undefined && (roles as readonly string[]).includes(role) ? (role as Role) : null;
}

export function can(actor: Member | null, ability: Ability): boolean {
  const role = roleOf(actor);
  return role !== null && grants[role].includes(ability);
}
