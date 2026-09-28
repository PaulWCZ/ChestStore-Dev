import type { Member } from "@argentic/chest-sdk/member";

// Who may do what, in one place. The roles are chest.json's, strongest
// first; the owner, the admins and the tool's builders enter with the first.
//
// - manager: every board, private ones too; changes any board's settings.
// - member: creates boards; works on the cards of the boards they see.
// - viewer: reads the boards they see and comments; changes nothing else.
//
// A board is "team" (everyone who has the tool sees it) or "private" (its
// people and the members of its groups). Its owners (its creator, and whom
// they name) change its settings.
export const roles = ["manager", "member", "viewer"] as const;
export type Role = (typeof roles)[number];

export function roleOf(actor: Member | null): Role | null {
  const role = actor?.role;
  return role !== null && role !== undefined && (roles as readonly string[]).includes(role) ? role as Role : null;
}

export type Ability = "boards.create" | "boards.all" | "import";

const grants: Record<Role, readonly Ability[]> = {
  manager: ["boards.create", "boards.all", "import"],
  member: ["boards.create", "import"],
  viewer: [],
};

export function can(actor: Member | null, ability: Ability): boolean {
  const role = roleOf(actor);
  return role !== null && grants[role].includes(ability);
}

// What a member may do on one board.
export type BoardAccess = "none" | "read" | "comment" | "write" | "own";
const rank: Record<BoardAccess, number> = { none: 0, read: 1, comment: 2, write: 3, own: 4 };
export const atLeast = (access: BoardAccess, needed: BoardAccess): boolean => rank[access] >= rank[needed];

export type BoardMembership = { visibility: "team" | "private"; people: { memberId: string; owner: boolean }[]; groups: string[] };

export function boardAccess(actor: Member | null, board: BoardMembership): BoardAccess {
  const role = roleOf(actor);
  if (!actor || role === null) return "none";
  if (role === "manager") return "own";
  const mine = board.people.find(p => p.memberId === actor.id);
  const inGroup = board.groups.some(g => actor.groups.includes(g));
  const sees = board.visibility === "team" || mine !== undefined || inGroup;
  if (!sees) return "none";
  if (role === "viewer") return "comment";
  return mine?.owner ? "own" : "write";
}
