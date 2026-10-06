import { createHash, randomBytes } from "node:crypto";
import type { Member } from "@argentic/chest-sdk/member";
import { isAddress } from "@argentic/chest-sdk/mail";
import { manages, sees } from "./access.ts";
import { AppError } from "@argentic/chest-app";
import { wantedPlaces, writeNamed } from "./answers.ts";
import type { Query, Sql } from "./db.ts";
import { isLocale, type Locale } from "../i18n/index.ts";
import { clean, limits, readAnswer } from "./model.ts";
import { closeDue, load, placesTaken, rights, type Poll } from "./polls.ts";

// Guests: people outside the Chest (a client, a candidate, the accountant)
// answering one date poll on the public host, as Doodle lets anyone with
// the link answer.
//
// - The organiser (or an admin) turns "Anyone with the link can answer" on
//   for a named date poll: the poll gets an unguessable link (130 random
//   bits). Turned off, the link stops; on again, it is a new link.
// - A guest types a name (an email if they want to be told the chosen
//   date), says yes / if need be / no per date. No account: the answer is
//   a participant "guest" with that name, never a member id.
// - To change it, the guest's browser keeps a random secret (a cookie on
//   the poll's public page, lib/guest-cookie.ts); the database keeps only
//   its hash. Someone else's browser cannot read or change it.
// - A guest sees the poll's words and their own answer, never the others'
//   answers or names (the team's names stay in the Chest). Once a date is
//   chosen, the page shows it, with a calendar file.
// - The public host is guarded by the package's bound on answerGuest
//   (src/actions.ts): a single-use form token, a form sent faster than a
//   person waits, a field only robots fill, answers counted per visitor
//   and for everyone a day; and at most limits.guests guests per poll.
// - Results mark guests ("Guest") in the grid, the participation count
//   gives them apart, the CSV says so; a manager may remove a guest's
//   answer (spam, or the guest asked).

export type GuestPoll = Pick<Poll, "id" | "title" | "details" | "organiser" | "status" | "closesAt" | "slots" | "finalOption" | "finalAt" | "questions">;

const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");
const base32 = "abcdefghijklmnopqrstuvwxyz234567";

// newLink: 26 characters of a-z2-7 (130 bits), the shape the database checks.
export function newLink(): string {
  const bytes = randomBytes(26);
  return [...bytes].map(b => base32[b & 31]).join("");
}

export const linkPattern = /^[a-z2-7]{26}$/u;
const secretPattern = /^[A-Za-z0-9_-]{32}$/u;

// setGuestLink: those who manage a named date poll open it to guests
// (a new link) or close it to them (the link stops; answers stay).
export async function setGuestLink(sql: Sql, actor: Member | null, pollId: unknown, on: boolean, now = new Date()): Promise<string | null> {
  return sql.begin(async tx => {
    await closeDue(tx, now);
    const poll = await load(tx, pollId, { lock: true });
    if (!sees(actor, rights(poll))) throw new AppError("not_found");
    if (!manages(actor, rights(poll))) throw new AppError("forbidden");
    if (!on) {
      await tx`update polls set guest_link = null, updated_at = ${now} where id = ${poll.id}`;
      return null;
    }
    if (poll.kind !== "date" || poll.anonymous) throw new AppError("invalid");
    if (poll.status !== "open") throw new AppError("closed");
    const [had] = await tx<{ guest_link: string | null }[]>`select guest_link from polls where id = ${poll.id}`;
    if (had?.guest_link) return had.guest_link;
    const link = newLink();
    await tx`update polls set guest_link = ${link}, updated_at = ${now} where id = ${poll.id}`;
    return link;
  });
}

// guestLink: the poll's link while it is open to guests.
export async function guestLink(sql: Query, pollId: string): Promise<string | null> {
  const [row] = await sql<{ guest_link: string | null }[]>`select guest_link from polls where id = ${pollId}`;
  return row?.guest_link ?? null;
}

// byLink: the poll a guest link opens, or not_found (no such link, turned
// off, deleted, a draft). Closing by date is evaluated first.
export async function byLink(sql: Query, link: unknown, options: { lock?: boolean; now?: Date } = {}): Promise<Poll> {
  if (typeof link !== "string" || !linkPattern.test(link)) throw new AppError("not_found");
  await closeDue(sql, options.now ?? new Date());
  const [row] = await sql<{ id: string }[]>`select id from polls where guest_link = ${link} and deleted_at is null and status <> 'draft' and kind = 'date' and not anonymous`;
  if (!row) throw new AppError("not_found");
  return load(sql, row.id, options);
}

export type GuestAnswer = { name: string; email: string; dates: Record<string, number> };

// mine: a guest's own answer, found by the secret their browser keeps.
export async function mine(sql: Query, poll: Pick<Poll, "id" | "questions">, secret: unknown): Promise<(GuestAnswer & { id: string }) | null> {
  if (typeof secret !== "string" || !secretPattern.test(secret)) return null;
  const [p] = await sql<{ id: string; guest_name: string; guest_email: string | null }[]>`
    select id, guest_name, guest_email from participants where poll_id = ${poll.id} and member = 'guest' and guest_key = ${hash(secret)}`;
  if (!p) return null;
  const dates: Record<string, number> = {};
  const q = poll.questions[0];
  for (const a of await sql<{ option_id: string | null; value: number | null }[]>`select option_id, value from answers where participant_id = ${p.id} and question_id = ${q?.id ?? "0"}`) {
    if (a.option_id !== null && a.value !== null) dates[String(a.option_id)] = a.value;
  }
  return { id: String(p.id), name: p.guest_name, email: p.guest_email ?? "", dates };
}

// answerAsGuest: a guest's answer to an open date poll, new or changed
// (with the secret of the first one). Answers the secret to keep: a new
// one for a first answer, the same one for a change.
export async function answerAsGuest(sql: Sql, link: unknown, input: { name: unknown; email: unknown; dates: unknown; locale: Locale; secret?: unknown }, now = new Date()): Promise<{ secret: string; first: boolean; poll: Poll }> {
  const name = clean(input.name, limits.guestName);
  const emailText = clean(input.email, limits.guestEmail, { optional: true }).toLowerCase();
  if (emailText !== "" && !isAddress(emailText)) throw new AppError("bad_email");
  return sql.begin(async tx => {
    const poll = await byLink(tx, link, { lock: true, now });
    if (poll.status !== "open") throw new AppError("closed");
    const q = poll.questions[0];
    if (!q) throw new AppError("not_found");
    const given = readAnswer({ [q.id]: { dates: input.dates } }, poll.questions, { slots: poll.slots !== null });
    const known = await mine(tx, poll, input.secret);
    if (poll.slots !== null) {
      const taken = await placesTaken(tx, poll, known?.id ?? null);
      for (const o of wantedPlaces(poll, given)) if ((taken[o] ?? 0) >= poll.slots) throw new AppError("full");
    }
    if (known) {
      await tx`update participants set guest_name = ${name}, guest_email = ${emailText || null}, guest_locale = ${input.locale} where id = ${known.id}`;
      await tx`delete from answers where participant_id = ${known.id}`;
      await writeNamed(tx, known.id, given);
      return { secret: input.secret as string, first: false, poll };
    }
    if ((await guestCount(tx, poll.id)) >= limits.guests) throw new AppError("guests_full", { max: limits.guests });
    const secret = randomBytes(24).toString("base64url");
    const [row] = await tx<{ id: string }[]>`
      insert into participants (poll_id, member, guest_name, guest_email, guest_locale, guest_key)
      values (${poll.id}, 'guest', ${name}, ${emailText || null}, ${input.locale}, ${hash(secret)}) returning id`;
    await writeNamed(tx, String(row!.id), given);
    return { secret, first: true, poll };
  });
}

export type Guest = { id: string; name: string; email: string | null };

// guests: who answered from outside, for those who manage the poll (their
// emails only to them).
export async function guests(sql: Query, actor: Member | null, poll: Poll): Promise<Guest[]> {
  if (!manages(actor, rights(poll))) return [];
  return (await sql<{ id: string; guest_name: string; guest_email: string | null }[]>`
    select id, guest_name, guest_email from participants where poll_id = ${poll.id} and member = 'guest' order by id`)
    .map(g => ({ id: String(g.id), name: g.guest_name, email: g.guest_email }));
}

// guestCount: how many guests answered (shown next to the members' count).
export async function guestCount(sql: Query, pollId: string): Promise<number> {
  return (await sql<{ n: number }[]>`select count(*)::int as n from participants where poll_id = ${pollId} and member = 'guest'`)[0]!.n;
}

// removeGuest: a manager takes a guest's answer out (spam, or the guest
// asked): their name, email and answer are deleted for good.
export async function removeGuest(sql: Sql, actor: Member | null, pollId: unknown, participantId: unknown): Promise<void> {
  await sql.begin(async tx => {
    const poll = await load(tx, pollId, { lock: true });
    if (!sees(actor, rights(poll))) throw new AppError("not_found");
    if (!manages(actor, rights(poll))) throw new AppError("forbidden");
    if (typeof participantId !== "string" || !/^[1-9][0-9]{0,17}$/u.test(participantId)) throw new AppError("not_found");
    const gone = await tx`delete from participants where id = ${participantId} and poll_id = ${poll.id} and member = 'guest' returning id`;
    if (gone.length === 0) throw new AppError("not_found");
  });
}

// toTell: the guests who gave an email, for the chosen date's email.
export async function toTell(sql: Query, pollId: string): Promise<{ id: string; name: string; email: string; locale: Locale }[]> {
  return (await sql<{ id: string; guest_name: string; guest_email: string; guest_locale: string }[]>`
    select id, guest_name, guest_email, guest_locale from participants where poll_id = ${pollId} and member = 'guest' and guest_email is not null order by id`)
    .map(g => ({ id: String(g.id), name: g.guest_name, email: g.guest_email, locale: isLocale(g.guest_locale) ? g.guest_locale : "en" as Locale }));
}

export type { Poll };
