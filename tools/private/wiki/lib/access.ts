import type { Member } from "@argentic/chest-sdk/member";

// Who may do what, in one place. The roles are chest.json's, strongest
// first; the owner, the admins and the tool's builders enter with the first.
//
// - editor: writes pages, creates and arranges spaces, imports.
// - reader: reads, searches, prints and exports what they see.
//
// A space is open to everyone who has the tool, or kept to some groups (HR,
// management…): then only the members of those groups see it, with its
// creator and the Chest's admins (so a space is never lost to everyone). A
// page is seen by whoever sees its space.
//
// Who edits a space: every editor who sees it, or only some of them — the
// groups and people it names, its creator and the Chest's admins. The
// others read it. A reader never writes, whatever a space names.
export const roles = ["editor", "reader"] as const;
export type Role = (typeof roles)[number];

export function roleOf(actor: Member | null): Role | null {
  const role = actor?.role;
  return role !== null && role !== undefined && (roles as readonly string[]).includes(role) ? role as Role : null;
}

export type Ability = "read" | "write" | "import";

const grants: Record<Role, readonly Ability[]> = {
  editor: ["read", "write", "import"],
  reader: ["read"],
};

export function can(actor: Member | null, ability: Ability): boolean {
  const role = roleOf(actor);
  return role !== null && grants[role].includes(ability);
}

// What a member may do in one space.
export type SpaceAccess = "none" | "read" | "write";
export type SpaceAudience = { visibility: "everyone" | "groups"; groups: string[]; createdBy: string; editing?: "editors" | "some"; editors?: string[] };

export function spaceAccess(actor: Member | null, space: SpaceAudience): SpaceAccess {
  const role = roleOf(actor);
  if (!actor || role === null) return "none";
  const sees = space.visibility === "everyone" || actor.isAdmin || space.createdBy === actor.id || space.groups.some(g => actor.groups.includes(g));
  if (!sees) return "none";
  if (!can(actor, "write")) return "read";
  if (space.editing !== "some" || actor.isAdmin || space.createdBy === actor.id) return "write";
  return (space.editors ?? []).some(w => w === actor.id || actor.groups.includes(w)) ? "write" : "read";
}
