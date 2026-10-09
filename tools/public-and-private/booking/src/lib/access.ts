import type { Member } from "@argentic/chest-sdk/member";

// Who may do what, in one place. Roles are chest.json's, strongest first;
// the owner, the admins and the tool's builders enter with the first.
//
// - admin: the company page, every host's bookings (and cancelling them);
//   a host too;
// - host: a booking page of their own — types, hours, days off — and their
//   bookings.
export const roles = ["admin", "host"] as const;
export type Role = (typeof roles)[number];
export type Ability = "host" | "bookings.all" | "settings";

const grants: Record<Role, readonly Ability[]> = {
  admin: ["host", "bookings.all", "settings"],
  host: ["host"],
};

export function roleOf(actor: Member | null): Role | null {
  const role = actor?.role;
  return role !== null && role !== undefined && (roles as readonly string[]).includes(role) ? role as Role : null;
}

export function can(actor: Member | null, ability: Ability): boolean {
  const role = roleOf(actor);
  return role !== null && grants[role].includes(ability);
}
