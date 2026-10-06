import type { Member } from "@argentic/chest-sdk/member";

// Who may do what, in one place. The roles are chest.json's, strongest
// first; the owner, the admins and the tool's builders enter with the first.
//
// - manager: everything — the stages and the team's own fields, every deal,
//   giving anything to anyone, deleting companies and contacts, importing,
//   exporting the whole client book at once.
// - sales: adds and edits companies and contacts, logs what happened on
//   anything, adds deals; changes only the deals they own (or that nobody
//   owns, which they may take). Sees everyone's.
// - viewer: reads everything and exports; changes nothing.
export const roles = ["manager", "sales", "viewer"] as const;
export type Role = (typeof roles)[number];

export function roleOf(actor: Member | null): Role | null {
  const role = actor?.role;
  return role !== null && role !== undefined && (roles as readonly string[]).includes(role) ? role as Role : null;
}

export type Ability =
  | "read"
  | "records.write" // add and edit companies and contacts
  | "records.delete.any" // delete any company or contact
  | "activities.log"
  | "deals.create"
  | "deals.all" // change any deal
  | "assign" // give a deal, a record or a step to someone else
  | "stages"
  | "fields" // the team's own fields
  | "import"
  | "export.all"; // the whole client book at once

const grants: Record<Role, readonly Ability[]> = {
  manager: ["read", "records.write", "records.delete.any", "activities.log", "deals.create", "deals.all", "assign", "stages", "fields", "import", "export.all"],
  sales: ["read", "records.write", "activities.log", "deals.create", "assign", "import"],
  viewer: ["read"],
};

export function can(actor: Member | null, ability: Ability): boolean {
  const role = roleOf(actor);
  return role !== null && grants[role].includes(ability);
}

// A deal is changed by a manager, by its owner, or — while nobody owns it —
// by any salesperson (who then may take it).
export function canEditDeal(actor: Member | null, deal: { owner: string | null }): boolean {
  if (!actor || !can(actor, "deals.create")) return false;
  if (can(actor, "deals.all")) return true;
  return deal.owner === actor.id || deal.owner === null;
}

// A company or a contact is deleted (for good) by a manager, or by its
// owner: a person's request to be forgotten often reaches their contact.
export function canDeleteRecord(actor: Member | null, record: { owner: string | null }): boolean {
  if (!actor) return false;
  if (can(actor, "records.delete.any")) return true;
  return can(actor, "records.write") && record.owner === actor.id;
}

// What was logged is edited by its author; removed by its author or a manager.
export function canChangeActivity(actor: Member | null, activity: { author: string }, change: "edit" | "remove"): boolean {
  if (!actor || !can(actor, "activities.log")) return false;
  if (activity.author === actor.id) return true;
  return change === "remove" && can(actor, "deals.all");
}

// An import is taken back by its author or a manager, within a day.
export function canUndoImport(actor: Member | null, imported: { author: string }): boolean {
  if (!actor || !can(actor, "import")) return false;
  return imported.author === actor.id || can(actor, "records.delete.any");
}

// A next step: done, changed or removed by its owner, by whoever created
// it, or by whoever may change what it is about (lib/steps.ts checks that
// last part against the deal or the contact).
export function ownsStep(actor: Member | null, step: { owner: string | null; createdBy: string }): boolean {
  if (!actor || !can(actor, "activities.log")) return false;
  return step.owner === actor.id || step.createdBy === actor.id || can(actor, "deals.all");
}

// A file on a record: added by whoever logs; removed by who added it or a
// manager.
export function canRemoveFile(actor: Member | null, file: { addedBy: string }): boolean {
  if (!actor || !can(actor, "activities.log")) return false;
  return file.addedBy === actor.id || can(actor, "deals.all");
}
