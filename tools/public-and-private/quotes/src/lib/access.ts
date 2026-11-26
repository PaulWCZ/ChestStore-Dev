import type { Member } from "@argentic/chest-sdk/member";

// Who may do what, in one place. The roles are chest.json's, strongest
// first; the owner, the admins and the tool's builders enter with the first.
// Every server action, route and page asks here, never in its own words.
//
// - admin: the company's legal details (they print on every document),
//   and everything below.
// - billing: issues the legal documents — finalises invoices and credit
//   notes (each takes the next number of a sequence that can never have a
//   gap, and is frozen for ten years), sends them, records payments, sends
//   reminders, exports for the accountant.
// - sales: clients, the catalogue, quotes from start to finish, and invoice
//   drafts (from an accepted quote, or blank), which they hand to billing.
// - viewer: reads everything, downloads the PDFs, exports for the
//   accountant (the accountant's own seat).
//
// Why a billing role, and not "sales finalise": a finalised number can
// never be taken back — only a credit note corrects it — so the few people
// who answer for the company's books issue them, as in any small company
// where the office manager, not each salesperson, sends the invoices. Why
// not "admin only": the person who invoices is rarely the one who manages
// the company's legal settings.
export const roles = ["admin", "billing", "sales", "viewer"] as const;
export type Role = (typeof roles)[number];

export type Ability =
  | "read"
  | "settings"
  | "clients.write"
  | "catalogue.write"
  | "quotes.write"
  | "invoices.draft"
  | "invoices.issue"
  | "payments"
  | "export";

const grants: Record<Role, readonly Ability[]> = {
  admin: ["read", "settings", "clients.write", "catalogue.write", "quotes.write", "invoices.draft", "invoices.issue", "payments", "export"],
  billing: ["read", "clients.write", "catalogue.write", "quotes.write", "invoices.draft", "invoices.issue", "payments", "export"],
  sales: ["read", "clients.write", "catalogue.write", "quotes.write", "invoices.draft"],
  viewer: ["read", "export"],
};

export function roleOf(actor: Member | null): Role | null {
  const role = actor?.role;
  return role !== null && role !== undefined && (roles as readonly string[]).includes(role) ? role as Role : null;
}

export function can(actor: Member | null, ability: Ability): boolean {
  const role = roleOf(actor);
  return role !== null && grants[role].includes(ability);
}

// The roles that issue invoices: who hears that a draft is ready.
export const issuers: readonly Role[] = roles.filter(r => grants[r].includes("invoices.issue"));
