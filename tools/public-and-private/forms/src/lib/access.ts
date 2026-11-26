import type { Member } from "@argentic/chest-sdk/member";

// Who may do what, in one place. The roles are chest.json's, strongest
// first; the owner, the admins and the tool's builders enter with the first.
//
// - manager: creates forms, opens every form (a colleague left, a person
//   asks for their answers to be erased), erases a person's answers;
// - creator: creates forms; opens the forms they own or that are shared
//   with them;
// - member: answers the team's forms; opens the forms shared with them.
//
// On one form, a level: owner (its creator, or any manager), editor
// (builds, publishes, deletes answers), viewer (reads answers, exports).
// A form someone may not open is not_found, never forbidden.
export const roles = ["manager", "creator", "member"] as const;
export type Role = (typeof roles)[number];

export type Ability = "forms.create" | "forms.all" | "forms.answer" | "privacy.erase";

const grants: Record<Role, readonly Ability[]> = {
  manager: ["forms.create", "forms.all", "forms.answer", "privacy.erase"],
  creator: ["forms.create", "forms.answer"],
  member: ["forms.answer"],
};

export function roleOf(actor: Member | null): Role | null {
  const role = actor?.role;
  return role !== null && role !== undefined && (roles as readonly string[]).includes(role) ? (role as Role) : null;
}

export function can(actor: Member | null, ability: Ability): boolean {
  const role = roleOf(actor);
  return role !== null && grants[role].includes(ability);
}

export const levels = ["viewer", "editor", "owner"] as const;
export type Level = (typeof levels)[number];

// levelOn: the actor's level on a form, from its owner and its shares; null
// when they may not open it.
export function levelOn(actor: Member | null, form: { owner: string }, shared: Level | null): Level | null {
  if (!actor || roleOf(actor) === null) return null;
  if (can(actor, "forms.all") || form.owner === actor.id) return "owner";
  return shared;
}

export function atLeast(level: Level | null, wanted: Level): boolean {
  return level !== null && levels.indexOf(level) >= levels.indexOf(wanted);
}
