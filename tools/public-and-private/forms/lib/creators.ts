import type { Member } from "@argentic/chest-sdk/member";
import { can, roleOf } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Query } from "./db.ts";
import { getSetting, putSetting } from "./settings.ts";

// Who may make forms. The Creator role gives it to a person; the company
// may also give it to everyone at once — "Everyone can make forms", a
// manager's switch (off until a manager turns it on) — as Google Forms and
// Tally do, so a 50-person company does not hand the Creator role out one
// by one. With it on, a Member makes forms exactly as a Creator does: they
// own their forms, share them, publish them, public ones included. A
// Member still opens only the forms they own or that are shared with them;
// only a manager opens every form. Turned off again, nobody loses a form:
// a Member keeps owning (and editing, sharing) the forms they made, but
// makes no new one.
const key = "everyone_creates";

export async function everyoneCreates(sql: Query): Promise<boolean> {
  return (await getSetting<boolean>(sql, key)) === true;
}

export async function setEveryoneCreates(sql: Query, actor: Member | null, on: unknown): Promise<boolean> {
  if (!can(actor, "forms.all")) throw new AppError("forbidden");
  if (typeof on !== "boolean") throw new AppError("invalid");
  await putSetting(sql, key, on);
  return on;
}

// mayCreate: the Creator role (or Manager), or a Member while everyone may.
export async function mayCreate(sql: Query, actor: Member | null): Promise<boolean> {
  if (!actor) return false;
  if (can(actor, "forms.create")) return true;
  return roleOf(actor) === "member" && (await everyoneCreates(sql));
}
