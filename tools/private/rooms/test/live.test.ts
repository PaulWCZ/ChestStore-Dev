import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { connect } from "@argentic/chest-sdk/realtime/client";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { camille, everyone, hugo } from "./support/members.ts";

// The pages others change follow them live (src/islands/Live.tsx: the
// "office" channel, SDK 0.7.0 realtime): chest.json's channel and feeds, as
// the Chest takes them, tell an open page each row written — its keys
// only, never what it holds (a visitor's name, a leave), the page then read
// again from the server, which decides what its reader may see.

type Realtime = Exclude<NonNullable<Parameters<typeof fakeChest>[0]>["realtime"], undefined>;
const manifest = JSON.parse(readFileSync(new URL("../chest.json", import.meta.url), "utf8")) as { capabilities: string[]; realtime: Realtime };

let chest: FakeChest;
before(async () => {
  chest = await fakeChest({ members: everyone, capabilities: manifest.capabilities.filter(c => c !== "database"), realtime: manifest.realtime });
});
after(async () => {
  await chest.close();
});

test("a page joins the office channel and hears the rows' keys only, never what they hold", async () => {
  const page = connect({ url: chest.realtime.url(hugo.id) });
  const office = page.channel("office");
  const heard: { name: string; row: unknown }[] = [];
  const joined = new Promise<void>(resolve => office.onJoined(() => resolve()));
  for (const name of ["room_bookings.insert", "presence.update", "visits.insert"]) office.on(name, row => { heard.push({ name, row }); });
  await joined;
  chest.realtime.commit("room_bookings", "insert", { id: 7, room_id: 2, member_id: camille.id, title: "Board" });
  chest.realtime.commit("presence", "update", { member_id: hugo.id, day: "2026-11-26", status: "off", leave_ref: "leave:42" });
  chest.realtime.commit("visits", "insert", { id: 3, name: "Paul Durand", company: "Durand SA", host: camille.id });
  for (let i = 0; i < 100 && heard.length < 3; i++) await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(heard, [
    { name: "room_bookings.insert", row: { id: 7 } },
    { name: "presence.update", row: { member_id: hugo.id, day: "2026-11-26" } },
    { name: "visits.insert", row: { id: 3 } },
  ]);
  page.close();
});
