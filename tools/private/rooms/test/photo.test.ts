import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { authorisePhoto, photoLink, recordPhoto } from "../src/lib/photos.ts";
import { offices, removeRoom } from "../src/lib/places.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, nora } from "./support/members.ts";
import { office, zone } from "./support/places.ts";

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone });
});
after(async () => {
  await chest.close();
  await database.close();
});

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array<number>(64).fill(0)]);

test("an admin adds a room photo through the Chest; members open it by a fresh link; others may not upload", async () => {
  const { sql } = database;
  const o = await office(sql);
  await assert.rejects(authorisePhoto(sql, asMember(hugo), o.atlas, 100), { code: "forbidden" });
  await assert.rejects(authorisePhoto(sql, asMember(camille), o.atlas, 11 << 20), { code: "file_too_large" });
  const up = await authorisePhoto(sql, asMember(camille), o.atlas, png.length);
  const sent = await chest.upload(up.url, png, "image/png");
  assert.equal(sent.status, 201);
  const { name } = await sent.json() as { name: string };
  await assert.rejects(recordPhoto(sql, asMember(camille), o.atlas, "rooms/999/0123456789abcdef0123.png"), { code: "invalid" });
  await assert.rejects(recordPhoto(sql, asMember(camille), o.atlas, `rooms/${o.atlas}/0123456789abcdef0123.png`), { code: "file_missing" });
  await recordPhoto(sql, asMember(camille), o.atlas, name);
  assert.equal((await offices(sql, asMember(hugo)))[0]!.floors[0]!.rooms[0]!.photo, true);
  assert.match(await photoLink(sql, asMember(hugo), o.atlas, true), /\/_chest\/files\//u);
  await assert.rejects(photoLink(sql, asMember(nora), o.atlas, true), { code: "forbidden" });
  // A second photo replaces the first, which leaves the Chest.
  const again = await chest.upload((await authorisePhoto(sql, asMember(camille), o.atlas, png.length)).url, png, "image/png");
  const second = (await again.json() as { name: string }).name;
  await recordPhoto(sql, asMember(camille), o.atlas, second);
  assert.equal(chest.files.has(name), false);
  assert.equal(chest.files.has(second), true);
  const removed = await removeRoom(sql, asMember(camille), o.atlas, zone);
  assert.equal(removed.photo, second);
});
