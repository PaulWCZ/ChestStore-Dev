import { randomInt } from "node:crypto";
import type { Member } from "@argentic/chest-sdk/member";
import { asked, can, sees } from "./access.ts";
import { AppError } from "@argentic/chest-app";
import type { Query, Sql } from "./db.ts";
import { readAnswer, type Given } from "./model.ts";
import { chestGroups } from "./groups.ts";
import { closeDue, load, placesTaken, rights, type Poll } from "./polls.ts";
import { teamFloor } from "./teams.ts";

// Answering a poll. One answer per member and poll (participants), bound
// to the member the Chest asserts — never to an id a browser sends.
//
// A named poll keeps each answer with its participant: the member may
// change it until the poll closes.
//
// An anonymous poll keeps no link between a person and what they answered:
// - participants says only who has answered (so nobody answers twice, and
//   the organiser sees how many did);
// - tallies holds counts, texts holds free texts, neither names anyone nor
//   holds a time;
// - every answer rewrites all of the poll's participants, tallies and texts
//   in one transaction, in a random order: each row then carries the same
//   transaction id and a new place on disk, so neither the order of the
//   rows nor PostgreSQL's own row stamps (xmin, ctid) tell which one came
//   last. The answer cannot be changed afterwards: nothing says which is
//   yours. Its limits are in README.md ("Anonymous polls").
//
// An anonymous survey also counts each answer in the answerer's groups of 5
// members or more (group_tallies), so it may be read per team once closed
// (lib/teams.ts).
export async function answer(sql: Sql, actor: Member | null, pollId: unknown, input: unknown, now = new Date()): Promise<{ first: boolean; poll: Poll }> {
  if (!actor || !can(actor, "answer")) throw new AppError("forbidden");
  // Read before the transaction (the Chest is asked): the answerer's groups
  // large enough to be counted.
  const known = await chestGroups();
  const teams = known ? actor.groups.filter(g => known.some(k => k.id === g && k.size >= teamFloor)) : [];
  return sql.begin(async tx => {
    await closeDue(tx, now);
    const poll = await load(tx, pollId, { lock: true });
    if (!sees(actor, rights(poll))) throw new AppError("not_found");
    if (poll.status === "draft") throw new AppError("locked");
    if (!asked(actor, rights(poll))) throw new AppError("not_asked");
    if (poll.status === "closed") throw new AppError("closed");
    const given = readAnswer(input, poll.questions, { slots: poll.slots !== null });
    const [existing] = await tx<{ id: string }[]>`select id from participants where poll_id = ${poll.id} and member = ${actor.id}`;
    // A sign-up sheet: a place is taken only if one is left (the poll row is
    // locked: two people cannot take the last place at once). Keeping a
    // place one already has is always fine.
    if (poll.slots !== null) {
      const taken = await placesTaken(tx, poll, existing?.id ?? null);
      for (const o of wantedPlaces(poll, given)) {
        if ((taken[o] ?? 0) >= poll.slots) throw new AppError("full");
      }
    }
    if (poll.anonymous) {
      if (existing) throw new AppError("already");
      await anonymous(tx, poll, actor.id, given, poll.kind === "survey" ? teams : []);
      return { first: true, poll };
    }
    let participant = existing?.id;
    if (participant) await tx`delete from answers where participant_id = ${participant}`;
    else participant = (await tx<{ id: string }[]>`insert into participants (poll_id, member) values (${poll.id}, ${actor.id}) returning id`)[0]!.id;
    await writeNamed(tx, participant, given);
    return { first: !existing, poll };
  });
}

// writeNamed keeps a named answer: one row per chosen option, value or
// text, tied to its participant (a member, or a guest: lib/guests.ts).
export async function writeNamed(tx: Query, participant: string, given: Map<string, Given>): Promise<void> {
  const rows: { participant_id: string; question_id: string; option_id: string | null; value: number | null; text: string | null }[] = [];
  for (const [question, g] of given) {
    const row = (option: string | null, value: number | null, text: string | null) => rows.push({ participant_id: participant, question_id: question, option_id: option, value, text });
    if (g.kind === "choice") {
      for (const o of g.options) row(o, null, null);
      if (g.other) row(null, null, g.other);
    } else if (g.kind === "date") for (const [o, v] of g.values) row(o, v, null);
    else if (g.kind === "scale" || g.kind === "enps") row(null, g.value, null);
    else row(null, null, g.text);
  }
  if (rows.length > 0) await tx`insert into answers ${tx(rows, "participant_id", "question_id", "option_id", "value", "text")}`;
}

// wantedPlaces: the options an answer takes a place in on a sign-up sheet
// (a choice, or a date's "yes").
export function wantedPlaces(poll: Pick<Poll, "questions">, given: Map<string, Given>): string[] {
  const g = given.get(poll.questions[0]!.id);
  return g?.kind === "choice" ? g.options : g?.kind === "date" ? [...g.values].filter(([, v]) => v === 2).map(([o]) => o) : [];
}

// shuffle: Fisher–Yates with the system's cryptographic random numbers.
export function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

async function anonymous(tx: Query, poll: Poll, member: string, given: Map<string, Given>, teams: readonly string[]): Promise<void> {
  const tallies = new Map<string, { question_id: string; key: string; count: number }>();
  for (const t of await tx<{ question_id: string; key: string; count: number }[]>`select question_id, key, count from tallies where poll_id = ${poll.id}`) {
    tallies.set(`${t.question_id}|${t.key}`, { question_id: String(t.question_id), key: t.key, count: t.count });
  }
  const add = (question: string, key: string) => {
    const k = `${question}|${key}`;
    const t = tallies.get(k) ?? { question_id: question, key, count: 0 };
    t.count++;
    tallies.set(k, t);
  };
  const texts: { question_id: string; body: string; reply_key: string | null }[] = (await tx<{ question_id: string; body: string; reply_key: string | null }[]>`select question_id, body, reply_key from texts where poll_id = ${poll.id}`).map(t => ({ question_id: String(t.question_id), body: t.body, reply_key: t.reply_key }));
  for (const [question, g] of given) {
    add(question, "n");
    if (g.kind === "choice") {
      for (const o of g.options) add(question, "o" + o);
      if (g.other) {
        add(question, "other");
        texts.push({ question_id: question, body: g.other, reply_key: null });
      }
    } else if (g.kind === "date") for (const [o, v] of g.values) add(question, `o${o}:${v}`);
    else if (g.kind === "scale" || g.kind === "enps") add(question, "v" + g.value);
    else texts.push({ question_id: question, body: g.text, reply_key: g.replyKey ?? null });
  }
  // The same counts in each of the answerer's groups.
  const byGroup = new Map<string, { group_id: string; question_id: string; key: string; count: number }>();
  for (const t of await tx<{ group_id: string; question_id: string; key: string; count: number }[]>`select group_id, question_id, key, count from group_tallies where poll_id = ${poll.id}`) {
    byGroup.set(`${t.group_id}|${t.question_id}|${t.key}`, { group_id: t.group_id, question_id: String(t.question_id), key: t.key, count: t.count });
  }
  const mine = new Map<string, number>();
  for (const [question, g] of given) {
    if (g.kind === "text") continue; // a sentence is never split by group
    mine.set(`${question}|n`, 1);
    if (g.kind === "choice") {
      for (const o of g.options) mine.set(`${question}|o${o}`, 1);
      if (g.other) mine.set(`${question}|other`, 1);
    } else if (g.kind === "date") for (const [o, v] of g.values) mine.set(`${question}|o${o}:${v}`, 1);
    else if (g.kind === "scale" || g.kind === "enps") mine.set(`${question}|v${g.value}`, 1);
  }
  for (const group of teams) {
    for (const k of mine.keys()) {
      const [question, key] = k.split("|") as [string, string];
      const at = `${group}|${question}|${key}`;
      const t = byGroup.get(at) ?? { group_id: group, question_id: question, key, count: 0 };
      t.count++;
      byGroup.set(at, t);
    }
  }
  const participants = (await tx<{ member: string }[]>`select member from participants where poll_id = ${poll.id}`).map(p => p.member);
  participants.push(member);

  await tx`delete from participants where poll_id = ${poll.id}`;
  await tx`delete from tallies where poll_id = ${poll.id}`;
  await tx`delete from texts where poll_id = ${poll.id}`;
  await tx`delete from group_tallies where poll_id = ${poll.id}`;
  await tx`insert into participants ${tx(shuffle(participants).map(m => ({ poll_id: poll.id, member: m })), "poll_id", "member")}`;
  const t = shuffle([...tallies.values()]).map(x => ({ poll_id: poll.id, question_id: x.question_id, key: x.key, count: x.count }));
  if (t.length > 0) await tx`insert into tallies ${tx(t, "poll_id", "question_id", "key", "count")}`;
  const gt = shuffle([...byGroup.values()]).map(x => ({ poll_id: poll.id, group_id: x.group_id, question_id: x.question_id, key: x.key, count: x.count }));
  if (gt.length > 0) await tx`insert into group_tallies ${tx(gt, "poll_id", "group_id", "question_id", "key", "count")}`;
  const s = shuffle(texts).map((x, i) => ({ poll_id: poll.id, question_id: x.question_id, body: x.body, shuffle: i, reply_key: x.reply_key }));
  if (s.length > 0) await tx`insert into texts ${tx(s, "poll_id", "question_id", "body", "shuffle", "reply_key")}`;
}
