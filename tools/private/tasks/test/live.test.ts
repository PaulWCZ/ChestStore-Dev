import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { connect } from "@argentic/chest-sdk/realtime/client";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { onEvent as POST } from "../src/lib/deliveries.ts";
import { erase } from "../src/lib/lifecycle.ts";
import { admit } from "../src/lib/live.ts";
import * as boards from "../src/lib/boards.ts";
import * as cards from "../src/lib/cards.ts";
import { en } from "../src/i18n/en.ts";
import { boardChannel, boardFeeds, followBoards } from "../src/shared/live.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, groups, hugo, ines, lea } from "./support/members.ts";

// Realtime instead of polling: the pages left open (a board, My tasks, the
// boards) follow board:<id>, whose feeds carry ids alone; whatever changes
// inside a card touches the card, so the cards feed tells the board.

// Who is in board_live, as the Chest reads it at each join (a snapshot the
// tests take after Tasks wrote it: the fake's check is synchronous).
let tickets = new Set<string>();
const snapshot = async () => {
  tickets = new Set((await database.sql<{ board_id: string; member_id: string }[]>`select board_id, member_id from board_live`).map(r => `${r.board_id}|${r.member_id}`));
};
const membership = (table: string, key: string, member: string) => table === "board_live" && tickets.has(`${key}|${member}`);

const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "..", "chest.json"), "utf8"));
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone, capabilities: ["members", "files", "notifications", "realtime"], realtime: { ...manifest.realtime, membership } });
});
after(async () => {
  await chest.close();
  await database.close();
});

test("chest.json's feeds are the tables the pages follow, on board:<id>, ids only", () => {
  assert.ok(manifest.capabilities.includes("realtime"));
  assert.deepEqual(manifest.realtime.channels, [{ name: "board:{id}", join: { table: "board_live", key: "board_id", member: "member_id" } }]);
  assert.deepEqual(manifest.realtime.feeds.map((f: { table: string }) => f.table).sort(), [...boardFeeds].sort());
  for (const feed of manifest.realtime.feeds as { table: string; channel: string; columns: string[] }[]) {
    assert.match(feed.channel, /^board:\{(board_)?id\}$/u);
    assert.ok(feed.columns.every(c => c === "id" || c === "board_id"), `${feed.table}: ids only, never a title nor a person`);
  }
  assert.deepEqual(followBoards(new Map([["3", "17"], ["4", "18"]])), [{ channel: "board:3", names: [...boardFeeds], ticket: "17" }, { channel: "board:4", names: [...boardFeeds], ticket: "18" }]);
});

test("the Chest takes the manifest: a card's row is told on its board's channel", () => {
  const positions = chest.realtime.commit("cards", "update", { id: 7, board_id: 3, title: "never sent" });
  assert.equal(positions.length, 1);
  assert.equal(boardChannel("3"), "board:3");
});

test("whatever changes inside a card touches it, so the open board hears of it", async () => {
  const { sql } = database;
  const b = await boards.createBoard(sql, asMember(hugo), { name: "Live" }, en.templates.columns);
  const [todo] = await boards.columns(sql, b.id);
  const c = await cards.addCard(sql, asMember(hugo), b.id, todo!.id, "Watch me");
  const stamp = async () => (await sql<{ at: Date }[]>`select changed_at as at from cards where id = ${c.id}`)[0]!.at.getTime();
  const moved = async (what: string, change: () => Promise<unknown>) => {
    const before = await stamp();
    await new Promise(resolve => setTimeout(resolve, 5));
    await change();
    assert.ok((await stamp()) > before, `${what} touches the card`);
  };
  await moved("a person", () => cards.setAssignees(sql, asMember(hugo), c.id, [ines.id]));
  await moved("a comment", () => cards.addComment(sql, asMember(hugo), c.id, "On it"));
  await moved("a step", () => sql`insert into checklist_items (card_id, text, position) values (${c.id}, 'Step', 'a')`);
  await moved("a step removed", () => sql`delete from checklist_items where card_id = ${c.id}`);
  await moved("a person taken off", () => cards.setAssignees(sql, asMember(hugo), c.id, []));
});

// The board's channel is the Chest's to open, from board_live (chest.json's
// "join"): only who Tasks checked sees the board; their row goes when that
// may have changed, and the Chest takes them out at once.
test("a board's live channel: only who sees it joins; a change of people, groups, visibility, role, departure or deletion takes them out", async () => {
  const { sql } = database;
  const screens = [hugo, ines].map(m => connect({ url: chest.realtime.url(m.id) }));
  try {
    // A private board of Hugo's, shared with nobody: Inès (a member) does not see it.
    const b = await boards.createBoard(sql, asMember(hugo), { name: "Private " + Math.random(), visibility: "private" }, en.templates.columns);
    const mark = (await admit(sql, [b.id], hugo.id)).get(b.id);
    assert.ok(mark);
    assert.equal((await admit(sql, [b.id], hugo.id)).get(b.id), mark, "let in once: the same mark");
    await assert.rejects(boards.board(sql, asMember(ines), b.id), /not_found/u);
    assert.ok(!(await boards.listBoards(sql, asMember(ines))).some(x => x.id === b.id), "never listed, so never let in");
    await snapshot();
    const outcome = (screen: ReturnType<typeof connect>) => new Promise<string>(resolve => {
      const ch = screen.channel(`board:${b.id}`);
      ch.onJoined(() => resolve("joined"));
      ch.onRefused(code => resolve(code));
    });
    assert.equal(await outcome(screens[1]!), "forbidden", "Inès is refused: no event of a board she cannot see");
    assert.equal(await outcome(screens[0]!), "joined", "Hugo sees it: he joins");
    const rows = async () => (await sql<{ member_id: string }[]>`select member_id from board_live where board_id = ${b.id} order by member_id`).map(r => r.member_id);
    // Renamed: nobody's access changes.
    await boards.updateBoard(sql, asMember(hugo), b.id, { name: "Renamed" });
    assert.deepEqual(await rows(), [hugo.id]);
    // Shared with Sales (Inès's group): checked again, both let in at their next read.
    await boards.setPeople(sql, asMember(hugo), b.id, { people: [hugo.id], owners: [hugo.id], groups: [groups.sales] });
    assert.deepEqual(await rows(), []);
    const again = (await admit(sql, [b.id], hugo.id)).get(b.id);
    assert.notEqual(again, mark, "a new mark: the page's island joins again");
    await boards.board(sql, asMember(ines), b.id);
    await admit(sql, [b.id], ines.id);
    // Inès's groups or role change (member.updated): her rows go; a name does not.
    const deliver = async (changed: ("name" | "groups" | "role")[], who = ines) => {
      assert.equal(await chest.deliver({ type: "member.updated", data: { id: who.id, changed } }, POST), 204);
    };
    await deliver(["name"]);
    assert.deepEqual(await rows(), [hugo.id, ines.id].sort());
    await deliver(["groups"]);
    assert.deepEqual(await rows(), [hugo.id]);
    await admit(sql, [b.id], ines.id);
    await deliver(["role"]);
    assert.deepEqual(await rows(), [hugo.id]);
    // Team, then private again: checked again each time.
    await admit(sql, [b.id], ines.id);
    await boards.updateBoard(sql, asMember(hugo), b.id, { visibility: "team" });
    assert.deepEqual(await rows(), []);
    // A team board's people change nobody's access: nobody is taken out.
    await admit(sql, [b.id], lea.id);
    await boards.setPeople(sql, asMember(hugo), b.id, { people: [hugo.id], owners: [hugo.id], groups: [] });
    assert.deepEqual(await rows(), [lea.id]);
    // Losing access, leaving, erasure: out.
    await admit(sql, [b.id], ines.id);
    await admit(sql, [b.id], camille.id);
    assert.equal(await chest.deliver({ type: "access.revoked", data: { id: lea.id } }, POST), 204);
    assert.equal(await chest.deliver({ type: "member.removed", data: { id: ines.id } }, POST), 204);
    assert.deepEqual(await rows(), [camille.id]);
    await erase(sql, camille.id);
    assert.deepEqual(await rows(), []);
    // Deleted (archived first): its rows go with it.
    await boards.archiveBoard(sql, asMember(hugo), b.id, true);
    await boards.deleteBoard(sql, asMember(hugo), b.id);
    assert.equal((await sql`select 1 from board_live where board_id = ${b.id}`).length, 0);
  } finally {
    for (const screen of screens) screen.close();
  }
});
