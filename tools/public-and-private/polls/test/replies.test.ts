import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { answer } from "../src/lib/answers.ts";
import { AppError } from "../src/core/tool.ts";
import { erase } from "../src/lib/lifecycle.ts";
import { limits } from "../src/lib/model.ts";
import * as polls from "../src/lib/polls.ts";
import * as replies from "../src/lib/replies.ts";
import * as tell from "../src/lib/tell.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, chestGroups, everyone, hugo, ines, lea, sofia, tom } from "./support/members.ts";

// Replies to anonymous free texts (lib/replies.ts): the organiser answers,
// the author reads and answers back with a key only their browser keeps —
// and nothing ties the author to the text.
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone, groups: chestGroups, capabilities: ["members", "notifications"] });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  await database.sql`truncate polls, tellings restart identity cascade`;
});

const now = new Date("2026-10-05T08:00:00Z");
const ctx = { zone: "Europe/Paris", now, today: "2026-10-05", known: null };
const refuses = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const key = () => randomBytes(32).toString("hex");
const hash = (k: string) => createHash("sha256").update(k).digest("hex");

async function survey() {
  const { sql } = database;
  const made = await polls.createPoll(sql, asMember(sofia), { kind: "survey", title: "How was the quarter?", anonymous: true, questions: [{ kind: "scale", text: "Your quarter?" }, { kind: "text", text: "Anything to tell us?" }], open: true }, ctx);
  const [scale, text] = (await polls.load(sql, made.id)).questions.map(q => q.id) as [string, string];
  const keys = new Map<string, string>();
  for (const [person, words] of [[hugo, "Too many meetings."], [ines, "More training, please."], [lea, "All good."], [tom, "The coffee machine."], [camille, "Thanks, team."]] as const) {
    const k = key();
    keys.set(person.id, k);
    await answer(sql, asMember(person), made.id, { [scale]: { value: 4 }, [text]: { text: words, replyKey: hash(k) } }, now);
  }
  return { id: made.id, keys };
}

const atOf = async (pollId: string, body: string) => Number((await database.sql`select shuffle from texts where poll_id = ${pollId} and body = ${body}`)[0]!["shuffle"]);

test("a key's hash is kept with the text — never the key, never a member — and survives the shuffled rewrites", async () => {
  const { sql } = database;
  const { id, keys } = await survey();
  const rows = await sql<{ body: string; reply_key: string }[]>`select body, reply_key from texts where poll_id = ${id}`;
  assert.equal(rows.length, 5);
  assert.ok(rows.some(r => r.body === "Too many meetings." && r.reply_key === hash(keys.get(hugo.id)!)), "Hugo's hash after four more rewrites");
  const columns = (await sql<{ column_name: string }[]>`select column_name from information_schema.columns where table_name = 'texts'`).map(c => c.column_name).sort();
  assert.deepEqual(columns, ["body", "poll_id", "question_id", "reply_key", "shuffle"], "no member, no time");
  await assert.rejects(answer(sql, asMember(sofia), id, { [(await polls.load(sql, id)).questions[1]!.id]: { text: "x", replyKey: "not a hash" } }, now), refuses("invalid"));
});

test("the organiser replies once the survey is closed; the author alone reads it with their key, and answers back anonymously", async () => {
  const { sql } = database;
  const { id, keys } = await survey();
  const at = await atOf(id, "Too many meetings.");
  await assert.rejects(replies.reply(sql, asMember(sofia), id, at, "Which ones?", now), refuses("locked"), "not while open");
  await polls.closePoll(sql, asMember(sofia), id, now);
  await assert.rejects(replies.reply(sql, asMember(hugo), id, at, "Me?", now), refuses("forbidden"), "a member does not reply as organiser");
  await assert.rejects(replies.reply(sql, asMember(sofia), id, 999, "?", now), refuses("not_found"));
  await assert.rejects(replies.answerBack(sql, asMember(hugo), id, keys.get(hugo.id), "Hello?"), refuses("locked"), "the author answers a reply, not before");
  const first = await replies.reply(sql, asMember(sofia), id, at, "Thanks — which meetings could go?", now);
  assert.equal(first.first, true);
  // An admin manages it too.
  await replies.reply(sql, asMember(camille), id, at, "We read every answer.", now);
  // Hugo's browser opens his conversation; Inès's key opens hers (no reply yet).
  const his = await replies.mine(sql, asMember(hugo), id, [keys.get(hugo.id), key()]);
  assert.deepEqual(his.map(c => [c.body, c.key, c.replies.map(r => [r.author, r.body])]), [["Too many meetings.", keys.get(hugo.id), [[sofia.id, "Thanks — which meetings could go?"], [camille.id, "We read every answer."]]]]);
  assert.deepEqual((await replies.mine(sql, asMember(ines), id, [keys.get(ines.id)])).map(c => c.replies.length), [0]);
  assert.deepEqual(await replies.mine(sql, asMember(ines), id, ["x", 3, key()]), [], "junk and unknown keys open nothing");
  await replies.answerBack(sql, asMember(hugo), id, keys.get(hugo.id), "The Monday status one.");
  await assert.rejects(replies.answerBack(sql, asMember(ines), id, key(), "?"), refuses("not_found"));
  // Those who manage it see every conversation; a member sees none.
  const all = await replies.conversations(sql, asMember(sofia), await polls.load(sql, id));
  assert.deepEqual(all!.get(at)!.map(r => r.author), [sofia.id, camille.id, "anonymous"]);
  assert.equal(await replies.conversations(sql, asMember(hugo), await polls.load(sql, id)), null);
  const columns = (await sql<{ column_name: string }[]>`select column_name from information_schema.columns where table_name = 'replies'`).map(c => c.column_name).sort();
  assert.deepEqual(columns, ["author", "body", "id", "poll_id", "text_at"], "a reply holds no time");
});

test("a survey below five answers, or a named one, takes no reply; a conversation has a ceiling", async () => {
  const { sql } = database;
  const small = await polls.createPoll(sql, asMember(sofia), { kind: "survey", title: "Small", anonymous: true, questions: [{ kind: "text", text: "Anything?" }], open: true }, ctx);
  const q = (await polls.load(sql, small.id)).questions[0]!;
  await answer(sql, asMember(hugo), small.id, { [q.id]: { text: "Hi" } }, now);
  await polls.closePoll(sql, asMember(sofia), small.id, now);
  await assert.rejects(replies.reply(sql, asMember(sofia), small.id, await atOf(small.id, "Hi"), "Hello", now), refuses("locked"));
  const { id } = await survey();
  await polls.closePoll(sql, asMember(sofia), id, now);
  const at = await atOf(id, "All good.");
  for (let i = 0; i < limits.replies; i++) await sql`insert into replies (poll_id, text_at, author, body) values (${id}, ${at}, ${sofia.id}, 'x')`;
  await assert.rejects(replies.reply(sql, asMember(sofia), id, at, "One more", now), refuses("too_many"));
});

test("everyone asked hears that a reply was written — never to whom; an erased organiser's replies stay, unnamed", async () => {
  const { sql } = database;
  const { id } = await survey();
  await polls.closePoll(sql, asMember(sofia), id, now);
  const done = await replies.reply(sql, asMember(sofia), id, await atOf(id, "The coffee machine."), "Fixed on Monday!", now);
  await tell.replied(done.poll, asMember(sofia));
  const told = chest.notifications.filter(n => n.key === tell.repliedKey(id));
  assert.ok(told.length >= 5, "everyone asked: " + told.length);
  assert.equal(told.find(n => n.member === hugo.id)!.title, "Sofia Rossi replied to an anonymous comment: How was the quarter?");
  assert.ok(!told.some(n => n.body?.includes("coffee")), "the bell never says which text");
  await erase(sql, sofia.id);
  assert.deepEqual((await sql`select author from replies where poll_id = ${id}`).map(r => r["author"]), ["erased"]);
});
