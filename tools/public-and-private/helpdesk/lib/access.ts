import type { Member } from "@argentic/chest-sdk/member";

// Who may do what, in one place. Roles are chest.json's, strongest first;
// the owner, the admins and the tool's builders enter with the first.
//
// - admin: everything, and the settings (the public form, saved replies,
//   renaming and deleting tags, the "waiting too long" threshold,
//   retention, erasing a customer's data, export);
// - agent: reads every ticket, answers, notes, assigns, closes, sets the
//   priority, tags (a new tag is created on the fly);
// - viewer: reads the tickets, changes nothing.
export const roles = ["admin", "agent", "viewer"] as const;
export type Role = (typeof roles)[number];

export type Ability = "tickets.read" | "tickets.answer" | "tickets.manage" | "replies.manage" | "tags.manage" | "settings" | "customers.erase" | "export";

const grants: Record<Role, readonly Ability[]> = {
  admin: ["tickets.read", "tickets.answer", "tickets.manage", "replies.manage", "tags.manage", "settings", "customers.erase", "export"],
  agent: ["tickets.read", "tickets.answer", "tickets.manage", "replies.manage", "export"],
  viewer: ["tickets.read"],
};

export function roleOf(actor: Member | null): Role | null {
  const role = actor?.role;
  return role !== null && role !== undefined && (roles as readonly string[]).includes(role) ? role as Role : null;
}

export function can(actor: Member | null, ability: Ability): boolean {
  const role = roleOf(actor);
  return role !== null && grants[role].includes(ability);
}

// The roles that answer tickets: they get the bell and the tile's number.
export const answering: readonly Role[] = ["admin", "agent"];
