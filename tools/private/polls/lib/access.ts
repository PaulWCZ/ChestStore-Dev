// Safe in the browser: no SDK values here (types only).
import type { Member } from "@argentic/chest-sdk/member";

// Who may do what, in one place. The roles are chest.json's, strongest
// first; the owner, the admins and the tool's builders enter with the first.
//
// - organiser: creates polls, always; manages their own polls (closes,
//   reopens, deletes them, picks a date poll's final date, downloads the
//   answers); answers the polls they are asked.
// - member: answers the polls they are asked, sees results when the
//   organiser allows it; creates polls too unless an admin has restricted
//   that to organisers (settings.members_create, true by default: in a
//   team, anyone asks "pizza or sushi?"). A member's own poll is theirs to
//   manage like an organiser's.
//
// An admin of the Chest (who arrives as organiser) manages every poll that
// is not a draft: sees its results, closes or deletes it. Nobody — not an
// admin, not the organiser — sees who answered what in an anonymous poll:
// the tool does not know it (lib/answers.ts).
//
// A poll someone may not see does not exist for them (not_found): a draft
// is its organiser's only; an open or closed poll is seen by those asked,
// its organiser and admins.
export const roles = ["organiser", "member"] as const;
export type Role = (typeof roles)[number];

export type Ability = "answer" | "create";

const grants: Record<Role, readonly Ability[]> = {
  organiser: ["answer", "create"],
  member: ["answer"],
};

export function roleOf(actor: Pick<Member, "role"> | null): Role | null {
  const role = actor?.role;
  return role !== null && role !== undefined && (roles as readonly string[]).includes(role) ? role as Role : null;
}

// The admin's choice of who may start a poll (the settings table).
export type Policy = { membersCreate: boolean };
export const defaultPolicy: Policy = { membersCreate: true };

export function can(actor: Pick<Member, "role"> | null, ability: Ability, policy: Policy = defaultPolicy): boolean {
  const role = roleOf(actor);
  if (role === null) return false;
  if (ability === "create" && role === "member") return policy.membersCreate;
  return grants[role].includes(ability);
}

// settles: may choose who starts polls (the Chest's admins).
export const settles = (actor: Pick<Member, "role" | "isAdmin"> | null): boolean => actor !== null && roleOf(actor) !== null && actor.isAdmin;

// What the rules need to know of a poll.
export type PollRights = {
  organiser: string;
  status: "draft" | "open" | "closed";
  everyone: boolean;
  groups: readonly string[];
  people: readonly string[];
  deleted: boolean;
  anonymous: boolean;
  results: "live" | "closed";
};

type Actor = Pick<Member, "id" | "role" | "isAdmin" | "groups">;

// Anonymous results stay hidden below this many answers: with fewer, a
// count or a comment would point at someone.
export const anonymousThreshold = 5;

// asked: the poll is put to this member (everyone who has the tool, the
// members of its groups, or the people picked by name).
export function asked(actor: Actor | null, poll: Pick<PollRights, "everyone" | "groups" | "people">): boolean {
  if (!actor || roleOf(actor) === null) return false;
  return poll.everyone || poll.groups.some(g => actor.groups.includes(g)) || poll.people.includes(actor.id);
}

// manages: may close, reopen, delete, pick the final date, download.
export function manages(actor: Actor | null, poll: PollRights): boolean {
  if (!actor || roleOf(actor) === null || poll.deleted && poll.organiser !== actor.id && !actor.isAdmin) return false;
  if (poll.status === "draft") return poll.organiser === actor.id;
  return poll.organiser === actor.id || actor.isAdmin;
}

// edits: may change the words and the closing date (the organiser only —
// even if members may no longer start polls, their own stay theirs).
export function edits(actor: Actor | null, poll: PollRights): boolean {
  return actor !== null && roleOf(actor) !== null && poll.organiser === actor.id && poll.status !== "closed";
}

export function sees(actor: Actor | null, poll: PollRights): boolean {
  if (!actor || roleOf(actor) === null || poll.deleted) return false;
  if (poll.status === "draft") return poll.organiser === actor.id;
  return manages(actor, poll) || asked(actor, poll);
}

// Whether the results show, and if not, why: "after_close" (kept for the
// end), "threshold" (an anonymous poll with fewer than five answers).
//
// An anonymous poll shows its results only once it is closed, and then to
// everyone at once — its organiser and the Chest's admins included, never
// before: watching the counts move after each answer ("6 of 7", then "7 of
// 7" right after a colleague said "done") would tell who answered what. A
// closed anonymous poll is never reopened (lib/polls.ts), so two closings
// cannot be compared either.
export type ResultsState = "shown" | "after_close" | "threshold";

export function resultsState(actor: Actor | null, poll: PollRights, answered: number): ResultsState {
  if (poll.anonymous) {
    if (poll.status !== "closed") return "after_close";
    return answered < anonymousThreshold ? "threshold" : "shown";
  }
  if (manages(actor, poll)) return "shown";
  if (poll.results === "live" || poll.status === "closed") return "shown";
  return "after_close";
}

// Who answered what is shown for named polls only, to those who see the
// results.
export function namesShown(actor: Actor | null, poll: PollRights, answered: number): boolean {
  return !poll.anonymous && resultsState(actor, poll, answered) === "shown";
}
