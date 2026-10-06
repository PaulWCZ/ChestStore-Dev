import type { Member } from "@argentic/chest-sdk/member";

// Who may do what, in one place. The roles are chest.json's, strongest
// first; the owner, the admins and the tool's builders enter with the first.
//
// - admin: sets up the offices (floors, areas, rooms, desks), the rules,
//   sees and cancels any booking, exports the bookings.
// - manager (the office manager, rarely an admin of the Chest): books
//   desks and rooms for anyone, changes and cancels any booking, and runs
//   the reception — every visitor of the day, their arrival. Not the
//   offices, the rules or the exports.
// - member: says where they work each day, books desks and rooms for
//   themselves, changes and cancels their own bookings, and announces
//   their own visitors.
//
// Everyone with a role sees who is at the office which day and who booked
// which room: organising the office together is the point of the tool.
export const roles = ["admin", "manager", "member"] as const;
export type Role = (typeof roles)[number];

export type Ability =
  | "book"          // presence, desks and rooms for oneself
  | "places.manage" // offices, floors, areas, rooms, desks
  | "rules.manage"  // how far ahead, desk days per week, hours…
  | "bookings.any"  // change or cancel anyone's booking; not held to the rules
  | "export"        // the bookings and occupancy as CSV
  | "visitors.all"; // every visitor of the day (reception), for any host

const grants: Record<Role, readonly Ability[]> = {
  admin: ["book", "places.manage", "rules.manage", "bookings.any", "export", "visitors.all"],
  manager: ["book", "bookings.any", "visitors.all"],
  member: ["book"],
};

export function roleOf(actor: Member | null): Role | null {
  const role = actor?.role;
  return role !== null && role !== undefined && (roles as readonly string[]).includes(role) ? role as Role : null;
}

export function can(actor: Member | null, ability: Ability): boolean {
  const role = roleOf(actor);
  return role !== null && grants[role].includes(ability);
}

// A booking is changed or cancelled by whoever made it, or by an admin.
export function mayChange(actor: Member | null, bookedBy: string): boolean {
  if (!actor || roleOf(actor) === null) return false;
  return bookedBy === actor.id || can(actor, "bookings.any");
}
