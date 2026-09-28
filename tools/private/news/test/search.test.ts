import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { AppError } from "../lib/errors.ts";
import { fold, highlight, snippet, terms } from "../lib/highlight.ts";
import * as posts from "../lib/posts.ts";
import { search, type Hit } from "../lib/search.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, fakeGroups, hugo, ines, lea, stranger } from "./support/members.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, groups: fakeGroups, capabilities: ["members", "files", "notifications"] });
});
after(async () => {
  await chest.close();
  await database.close();
});
beforeEach(async () => {
  await database.sql`truncate posts, files, reactions, comments, confirmations, rsvps, visits restart identity cascade`;
});

const zone = "Europe/Paris";
const refused = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;
const pub = asMember(camille);
const write = (input: posts.PostInput) => posts.createPost(database.sql, pub, input, { zone });
const find = (q: unknown, who = asMember(hugo)) => search(database.sql, who, q);
const marked = (segments: { text: string; hit: boolean }[] | null) => (segments ?? []).filter(s => s.hit).map(s => s.text);
const ids = (hits: Hit[]) => hits.map(h => h.id);

test("the words of a query: folded, letters and digits only, a few", () => {
  assert.equal(fold("Été ŒUVRE Straße"), "ete oeuvre strasse");
  assert.deepEqual(terms("  L'Équipe  d’été !! "), ["equipe", "ete"]);
  assert.deepEqual(terms("a"), ["a"]);
  assert.deepEqual(terms("x:* & !y | (z)"), ["x", "y", "z"]);
  assert.deepEqual(terms("one two three four five six seven eight nine"), ["one", "two", "three", "four", "five", "six", "seven", "eight"]);
  assert.deepEqual(terms(42), []);
  assert.deepEqual(terms("   "), []);
});

test("the words found are marked, by their beginning, accents and case aside", () => {
  assert.deepEqual(highlight("Le déménagement de l’équipe", ["demenag", "equipe"]), [
    { text: "Le ", hit: false }, { text: "déménagement", hit: true }, { text: " de l’", hit: false }, { text: "équipe", hit: true },
  ]);
  assert.deepEqual(highlight("", ["x"]), []);
  // A passage around the first word found, cut at words.
  const long = "Lorem ipsum ".repeat(40) + "the terrace opens on Friday " + "dolor sit amet ".repeat(40);
  const piece = snippet(long, ["terrace"], 120);
  const text = piece.map(s => s.text).join("");
  assert.ok(text.startsWith("…") && text.endsWith("…"), text);
  assert.ok([...text].length <= 124);
  assert.deepEqual(marked(piece), ["terrace"]);
  // Without a word found: the start.
  assert.equal(snippet("Short text?", ["zzz"]).map(s => s.text).join(""), "Short text?");
});

test("search finds posts by their headline and text, in French, accents and case aside", async () => {
  const move = await write({ kind: "announcement", title: "Déménagement le 2 novembre", body: "Nous partons au **14 rue des Arts**, 3e étage. L’équipe d’été aide." });
  const coffee = await write({ kind: "info", title: "Coffee machine fixed", body: "Thanks Hugo!" });
  assert.deepEqual(ids(await find("demenagement")), [move.id]);
  assert.deepEqual(ids(await find("DÉMÉNAG")), [move.id]);
  assert.deepEqual(ids(await find("equipe ete")), [move.id]);
  assert.deepEqual(ids(await find("coffee")), [coffee.id]);
  // Every word must be there.
  assert.deepEqual(await find("coffee demenagement"), []);
  // A headline with a typo.
  assert.deepEqual(ids(await find("cofee machin fixd")), [coffee.id]);
  const [hit] = await find("etage");
  assert.deepEqual(marked(hit!.title), []);
  assert.deepEqual(marked(hit!.text), ["étage"]);
  // The marks of the text are not shown.
  assert.ok(!hit!.text!.map(s => s.text).join("").includes("**"));
  assert.deepEqual(marked((await find("novembre"))[0]!.title), ["novembre"]);
  // Nothing to search.
  assert.deepEqual(await find(""), []);
  assert.deepEqual(await find("!!!"), []);
  assert.deepEqual(await find(["x"]), []);
  // No role, nothing.
  await assert.rejects(find("coffee", asMember(stranger)), refused("forbidden"));
  await assert.rejects(search(database.sql, null, "coffee"), refused("forbidden"));
});

test("search finds comments, under their post; deleted ones and deleted posts are never found", async () => {
  const p = await write({ kind: "info", title: "Parking", body: "New spaces behind the building." });
  const c1 = await posts.addComment(database.sql, asMember(ines), p.id, "Où sont les places vélo ?");
  await posts.addComment(database.sql, asMember(lea), p.id, "Super nouvelle");
  const [hit] = await find("velo");
  assert.equal(hit!.id, p.id);
  assert.equal(hit!.text, null);
  assert.deepEqual(hit!.comments.map(c => c.id), [c1.comment.id]);
  assert.equal(hit!.comments[0]!.author, ines.id);
  assert.deepEqual(marked(hit!.comments[0]!.text), ["vélo"]);
  // A word in the post and in a comment: one result.
  await posts.addComment(database.sql, asMember(hugo), p.id, "Behind which building?");
  const both = await find("building");
  assert.equal(both.length, 1);
  assert.equal(both[0]!.comments.length, 1);
  assert.ok(both[0]!.text);
  await posts.removeComment(database.sql, asMember(ines), c1.comment.id);
  assert.deepEqual(await find("velo"), []);
  await posts.deletePost(database.sql, pub, p.id);
  assert.deepEqual(await find("building"), []);
  assert.deepEqual(await find("building", pub), []);
});

test("a scheduled post is found by publishers only", async () => {
  const day = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const p = await write({ kind: "info", title: "Surprise party", publishAt: { day, time: "09:00" } });
  assert.deepEqual(await find("surprise"), []);
  const [hit] = await find("surprise", pub);
  assert.equal(hit!.id, p.id);
  assert.equal(hit!.scheduled, true);
});

test("a query is bounded and cannot change the search", async () => {
  const p = await write({ kind: "info", title: "Quotes: it's 100% fine", body: "a & b | c ! d" });
  assert.deepEqual(ids(await find("it's 100%")), [p.id]);
  assert.deepEqual(ids(await find("'); drop table posts; --")), []);
  assert.deepEqual(ids(await find("x".repeat(5000))), []);
  assert.equal((await database.sql`select count(*)::int as n from posts`)[0]!["n"], 1);
});
