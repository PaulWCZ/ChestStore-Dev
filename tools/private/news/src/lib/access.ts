import type { Member } from "@argentic/chest-sdk/member";
import { inAudience, type Audience } from "../shared/model.ts";

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

// Audience (lib/model.ts, inAudience): a post is for everyone, or for the
// members of some of the Chest's groups and some people picked by hand. Its
// audience — and only its audience — is told in the bell and by email,
// asked to confirm, counted in "Read by", and in the digest.
export { inAudience, type Audience, type Grouped } from "../shared/model.ts";

// Who sees a post kept to an audience: its audience, its author (who may edit
// it) and the Chest's admins (who answer for the whole Chest). Nobody else,
// whatever their role: for them it does not exist (not_found). Same rule
// as the SQL of lib/posts.ts (audienceSeen).
export function seesPost(actor: Member, post: Audience & { author: string }): boolean {
  return actor.isAdmin || post.author === actor.id || inAudience(actor, post);
}
