import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Sql } from "./db.ts";
import { format, plural } from "../i18n/index.ts";
import { email } from "./mail.ts";
import { memberId } from "./model.ts";
import { cut, notify } from "./notify.ts";
import { waitingList, type Waiting } from "./read.ts";
import type { clockAt } from "./tell.ts";

// "Waiting for a check-in this week": who has not checked in, for the
// people who chase it — the admins for the whole company, an objective's
// owner for its key results — and a "Remind" that reaches the person in
// the bell and by email, at most once a day whoever asks (the Friday
// reminder is the other one).

type Clock = ReturnType<typeof clockAt>;

// What this actor may see and chase: everything for an admin; for anyone
// else, the key results of the objectives they own (not their own ones:
// My goals shows those).
export async function waitingFor(sql: Sql, actor: Member | null, clock: Clock): Promise<Waiting[]> {
  if (!actor || !can(actor, "read")) throw new AppError("forbidden");
  const rows = can(actor, "any.write") ? await waitingList(sql, clock) : await waitingList(sql, clock, { objectiveOwner: actor.id });
  return rows.filter(r => r.owner !== actor.id);
}

// Who was reminded today already.
export async function remindedToday(sql: Sql, clock: Clock): Promise<Set<string>> {
  return new Set((await sql<{ member_id: string }[]>`select member_id from nudges where day = ${clock.today}`).map(r => r.member_id));
}

// Says whether the person was reminded (false: someone did today), and
// whether an email left now (their switch, their Chest preference and the
// Chest's mail allowing).
async function send(sql: Sql, actor: Member, owner: string, items: Waiting[], clock: Clock): Promise<{ reminded: boolean; emailed: boolean }> {
  const [row] = await sql`insert into nudges (member_id, day, sent_by) values (${owner}, ${clock.today}, ${actor.id}) on conflict do nothing returning member_id`;
  if (!row) return { reminded: false, emailed: false };
  const titles = items.map(i => i.title);
  await notify([owner], (t, locale) => ({ title: format(t.bell.nudge, { name: actor.name }), body: cut(`${plural(t.bell.reminder, items.length, locale)}: ${titles.join(" · ")}`, 280) }), { path: "/chest", key: "checkin" });
  const emailed = await email(sql, [owner], (t, locale) => ({
    subject: format(t.mail.nudgeSubject, { name: actor.name }),
    lines: [format(t.mail.nudgeIntro, { name: actor.name }), "", plural(t.bell.reminder, items.length, locale) + ":", ...titles.map(x => `- ${x}`)],
  }), { path: "/chest", key: `nudge:${clock.today}` });
  return { reminded: true, emailed: emailed > 0 };
}

// One person reminded. Refused when there is nothing of theirs this actor
// may chase; "already_reminded" when someone did today. Says whether an
// email left too (the page says "in the bell" only otherwise).
export async function remind(sql: Sql, actor: Member | null, owner: unknown, clock: Clock): Promise<{ emailed: boolean }> {
  const who = memberId(owner);
  const items = (await waitingFor(sql, actor, clock)).filter(i => i.owner === who);
  if (items.length === 0) throw new AppError("not_found");
  const done = await send(sql, actor!, who, items, clock);
  if (!done.reminded) throw new AppError("already_reminded");
  return { emailed: done.emailed };
}

// Everyone waiting, at once (admins): those reminded today are skipped.
export async function remindAll(sql: Sql, actor: Member | null, clock: Clock): Promise<number> {
  if (!actor || !can(actor, "any.write")) throw new AppError("forbidden");
  const items = await waitingFor(sql, actor, clock);
  const byOwner = new Map<string, Waiting[]>();
  for (const i of items) {
    const list = byOwner.get(i.owner);
    if (list) list.push(i);
    else byOwner.set(i.owner, [i]);
  }
  let sent = 0;
  for (const [owner, list] of byOwner) if ((await send(sql, actor, owner, list, clock)).reminded) sent++;
  return sent;
}
