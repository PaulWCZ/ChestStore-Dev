import { createHash } from "node:crypto";
import type { Member } from "@argentic/chest-sdk/member";
import { manages, resultsState, sees } from "./access.ts";
import { AppError } from "@argentic/chest-app";
import type { Query, Sql } from "./db.ts";
import { clean, limits } from "./model.ts";
import { closeDue, load, rights, type Poll } from "./polls.ts";

// Replies to anonymous free texts — Officevibe's two-way feedback: the
// manager answers "Thanks — what would help with the workload?" and the
// author, still anonymous, can answer back.
//
// How the author is reached without being known:
// - when they answer an anonymous survey, their browser makes a random key
//   for each free text and sends only its hash with the text (texts.
//   reply_key); the key itself stays in that browser (localStorage). No
//   member id, no time is stored with the text or its hash — as before.
// - once the survey is closed and its results show, those who manage it
//   (its organiser, the Chest's admins) reply under a text (replies, with
//   their member id: they are named). Everyone asked is told in the bell
//   that a reply was written, never to whom.
// - on the poll's page, the author's browser sends its keys; the server
//   hashes them, answers the conversations they open, and keeps nothing of
//   the request. The author answers back with the key: the reply is
//   stored as 'anonymous', with no time (its id orders the conversation).
// - a conversation is seen by those who manage the poll and by whoever
//   holds the key — nobody else, not the other members asked.
//
// What it does not protect against is the README's ("Anonymous polls"):
// the server's administrator, who could log a request with its member and
// its key, and what the text or a reply says.

export type Reply = { id: string; author: string; body: string };
export type Conversation = { at: number; key: string; question: string; body: string; replies: Reply[] };

const hash = (key: string) => createHash("sha256").update(key).digest("hex");
const keyPattern = /^[0-9a-f]{64}$/u;

// open: the poll's conversations may be written in — an anonymous survey,
// closed, its results shown (from 5 answers).
async function openFor(sql: Query, poll: Poll, actor: Member | null): Promise<void> {
  if (!poll.anonymous || poll.status !== "closed") throw new AppError("locked");
  const [{ n }] = (await sql<{ n: number }[]>`select count(*)::int as n from participants where poll_id = ${poll.id}`) as unknown as [{ n: number }];
  if (resultsState(actor, rights(poll), n) !== "shown") throw new AppError("locked");
}

async function repliesOf(sql: Query, pollId: string, at: number[] | null): Promise<Map<number, Reply[]>> {
  const rows = at === null
    ? await sql<{ id: string; text_at: number; author: string; body: string }[]>`select id, text_at, author, body from replies where poll_id = ${pollId} order by id`
    : at.length === 0 ? [] : await sql<{ id: string; text_at: number; author: string; body: string }[]>`select id, text_at, author, body from replies where poll_id = ${pollId} and text_at = any(${at}::double precision[]) order by id`;
  const out = new Map<number, Reply[]>();
  for (const r of rows) out.set(Number(r.text_at), [...(out.get(Number(r.text_at)) ?? []), { id: String(r.id), author: r.author, body: r.body }]);
  return out;
}

async function addReply(tx: Query, poll: Poll, at: number, author: string, body: string): Promise<Reply> {
  const [{ n }] = (await tx<{ n: number }[]>`select count(*)::int as n from replies where poll_id = ${poll.id} and text_at = ${at}`) as unknown as [{ n: number }];
  if (n >= limits.replies) throw new AppError("too_many", { max: limits.replies });
  const [row] = await tx<{ id: string }[]>`insert into replies (poll_id, text_at, author, body) values (${poll.id}, ${at}, ${author}, ${body}) returning id`;
  return { id: String(row!.id), author, body };
}

// conversations: every conversation of the poll, for those who manage it
// (null for anyone else).
export async function conversations(sql: Query, actor: Member | null, poll: Poll): Promise<Map<number, Reply[]> | null> {
  if (!poll.anonymous || poll.status !== "closed" || !manages(actor, rights(poll))) return null;
  return repliesOf(sql, poll.id, null);
}

// reply: those who manage the poll answer a free text.
export async function reply(sql: Sql, actor: Member | null, pollId: unknown, at: unknown, input: unknown, now = new Date()): Promise<{ poll: Poll; reply: Reply; first: boolean }> {
  const body = clean(input, limits.reply, { multiline: true });
  if (typeof at !== "number" || !Number.isFinite(at)) throw new AppError("not_found");
  return sql.begin(async tx => {
    await closeDue(tx, now);
    const poll = await load(tx, pollId, { lock: true });
    if (!sees(actor, rights(poll))) throw new AppError("not_found");
    if (!manages(actor, rights(poll))) throw new AppError("forbidden");
    await openFor(tx, poll, actor);
    const [text] = await tx<{ shuffle: number }[]>`select shuffle from texts where poll_id = ${poll.id} and shuffle = ${at}`;
    if (!text) throw new AppError("not_found");
    const had = await tx`select 1 from replies where poll_id = ${poll.id} and author <> 'anonymous' limit 1`;
    return { poll, reply: await addReply(tx, poll, at, actor!.id, body), first: had.length === 0 };
  });
}

// mine: the conversations the keys of this browser open (the author's own
// texts, with what was replied). Keys that open nothing are ignored.
export async function mine(sql: Sql, actor: Member | null, pollId: unknown, keys: unknown): Promise<Conversation[]> {
  const poll = await load(sql, pollId);
  if (!sees(actor, rights(poll)) || !poll.anonymous || poll.status !== "closed") return [];
  const given = new Map((Array.isArray(keys) ? keys : []).slice(0, 20).filter((k): k is string => typeof k === "string" && keyPattern.test(k)).map(k => [hash(k), k]));
  if (given.size === 0) return [];
  const texts = await sql<{ shuffle: number; question_id: string; body: string; reply_key: string }[]>`
    select shuffle, question_id, body, reply_key from texts where poll_id = ${poll.id} and reply_key = any(${[...given.keys()]}) order by shuffle`;
  const replies = await repliesOf(sql, poll.id, texts.map(t => Number(t.shuffle)));
  // Each conversation with the key (the browser's own) that opens it.
  return texts.map(t => ({ at: Number(t.shuffle), key: given.get(t.reply_key)!, question: String(t.question_id), body: t.body, replies: replies.get(Number(t.shuffle)) ?? [] }));
}

// answerBack: the author answers a conversation their key opens, once it
// has a reply (the text was their word; the reply opened the talk).
export async function answerBack(sql: Sql, actor: Member | null, pollId: unknown, key: unknown, input: unknown): Promise<{ poll: Poll; reply: Reply }> {
  const body = clean(input, limits.reply, { multiline: true });
  if (typeof key !== "string" || !keyPattern.test(key)) throw new AppError("not_found");
  return sql.begin(async tx => {
    const poll = await load(tx, pollId, { lock: true });
    if (!sees(actor, rights(poll))) throw new AppError("not_found");
    await openFor(tx, poll, actor);
    const [text] = await tx<{ shuffle: number }[]>`select shuffle from texts where poll_id = ${poll.id} and reply_key = ${hash(key)}`;
    if (!text) throw new AppError("not_found");
    const at = Number(text.shuffle);
    const opened = await tx`select 1 from replies where poll_id = ${poll.id} and text_at = ${at} and author <> 'anonymous' limit 1`;
    if (opened.length === 0) throw new AppError("locked");
    return { poll, reply: await addReply(tx, poll, at, "anonymous", body) };
  });
}
