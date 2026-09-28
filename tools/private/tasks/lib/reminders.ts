import type { Member } from "@argentic/chest-sdk/member";
import { roleOf } from "./access.ts";
import type { Sql } from "./db.ts";
import { AppError } from "./errors.ts";
import { withdraw } from "./notify.ts";

// The morning reminder's one switch, per person (on unless they turned it
// off), and taking an item back once nothing is due any more.
// The key of the reminder item: one per person, replaced each morning.
export const reminderKey = "digest";

export async function reminderOn(sql: Sql, actor: Member | null): Promise<boolean> {
  if (!actor || roleOf(actor) === null) throw new AppError("forbidden");
  const [row] = await sql<{ off: boolean }[]>`select off from reminders where member_id = ${actor.id}`;
  return !row?.off;
}

export async function setReminder(sql: Sql, actor: Member | null, on: unknown): Promise<void> {
  if (!actor || roleOf(actor) === null) throw new AppError("forbidden");
  if (typeof on !== "boolean") throw new AppError("invalid");
  await sql`insert into reminders (member_id, off) values (${actor.id}, ${!on}) on conflict (member_id) do update set off = excluded.off`;
  // Turned off: this morning's item goes too.
  if (!on) await settle(sql, [actor.id]);
}

// settle takes back the morning's item of these people (those who have
// one): nothing is due for them any more, or they turned it off.
export async function settle(sql: Sql, people: string[]): Promise<void> {
  if (people.length === 0) return;
  const had = (await sql<{ member_id: string }[]>`update reminders set sent_on = null where member_id in ${sql(people)} and sent_on is not null returning member_id`).map(r => r.member_id);
  if (had.length > 0) await withdraw(reminderKey, had);
}
