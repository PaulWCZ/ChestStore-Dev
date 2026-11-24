import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as boards from "../src/lib/boards.ts";
import * as cards from "../src/lib/cards.ts";
import { en } from "../src/i18n/en.ts";
import { boardChannel, boardFeeds, followBoards } from "../src/shared/live.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { everyone, hugo, ines } from "./support/members.ts";

// Realtime instead of polling: the pages left open (a board, My tasks, the
// boards) follow board:<id>, whose feeds carry ids alone; whatever changes
// inside a card touches the card, so the cards feed tells the board.

const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "..", "chest.json"), "utf8"));
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ network: {}, members: everyone, capabilities: ["members", "files", "notifications", "realtime"], realtime: manifest.realtime });
});
after(async () => {
  await chest.close();
  await database.close();
});

test("chest.json's feeds are the tables the pages follow, on board:<id>, ids only", () => {
  assert.ok(manifest.capabilities.includes("realtime"));
  assert.deepEqual(manifest.realtime.channels, [{ name: "board:*" }]);
  assert.deepEqual(manifest.realtime.feeds.map((f: { table: string }) => f.table).sort(), [...boardFeeds].sort());
  for (const feed of manifest.realtime.feeds as { table: string; channel: string; columns: string[] }[]) {
    assert.match(feed.channel, /^board:\{(board_)?id\}$/u);
    assert.ok(feed.columns.every(c => c === "id" || c === "board_id"), `${feed.table}: ids only, never a title nor a person`);
  }
  assert.deepEqual(followBoards(["3", "3", "4"]), [{ channel: "board:3", names: [...boardFeeds] }, { channel: "board:4", names: [...boardFeeds] }]);
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
