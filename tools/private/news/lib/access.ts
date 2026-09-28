import type { Member } from "@argentic/chest-sdk/member";

// Who may do what, in one place. The roles are chest.json's, strongest
// first; the owner, the admins and the tool's builders enter with the first.
//
// - publisher: writes, edits, schedules, pins and deletes posts; marks a
//   post Important and sees who confirmed it; removes any comment.
// - reader: reads, reacts, comments, confirms "I have read it", answers
//   events.
//
// A post that is scheduled (not yet published) or deleted is seen by
// publishers only; for a reader it does not exist (not_found).
export const roles = ["publisher", "reader"] as const;
export type Role = (typeof roles)[number];

export type Ability =
  | "read"
  | "react"
  | "publish"
  | "moderate"
  | "confirmations";

const grants: Record<Role, readonly Ability[]> = {
  publisher: ["read", "react", "publish", "moderate", "confirmations"],
  reader: ["read", "react"],
};

export function roleOf(actor: Member | null): Role | null {
  const role = actor?.role;
  return role !== null && role !== undefined && (roles as readonly string[]).includes(role) ? role as Role : null;
}

export function can(actor: Member | null, ability: Ability): boolean {
  const role = roleOf(actor);
  return role !== null && grants[role].includes(ability);
}
