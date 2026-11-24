import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, withMember } from "@argentic/chest-sdk/testing";
import { en as kit } from "@argentic/chest-ui/components/logic";
import { createElement as h } from "react";
import { createApp, formatter, hourIn, page } from "../dist/index.js";
import { db } from "../dist/db.js";
import { testDatabase } from "../dist/testing.js";

// The two zones of SDK 0.7.0's "Times" table, far apart: the company in
// Paris, a member in Kiritimati (UTC+14, the first place on Earth to start
// a day). "Today", a deadline's day, working days follow the company —
// chest.today(), for every member; the member's zone only shows instants
// and sets their personal reminder's hour.
const words = {
  kit,
  tool: { name: "Probe" },
  pages: { notFound: { title: "Nothing here", body: ".", publicBody: "Ask whoever sent the link." }, forbidden: { title: "Not allowed", body: "." }, failed: { title: "Failed", body: "." }, signIn: "Sign in.", busy: "Busy.", language: "Language", back: "Back" },
  errors: { invalid: "Invalid.", empty: "Empty.", too_long: "Too long: {max} at most.", too_large: "Too large.", forbidden: "Forbidden.", not_found: "Not found.", unavailable: "Unavailable.", unknown: "Unknown.", expired: "Expired.", needs_javascript: "This form needs JavaScript." },
};
const someone = { firstName: "C", lastName: "M", name: "C M", photo: null, role: "member", isAdmin: false, isBuilder: false, groups: [], language: "en" };
const far = { ...someone, id: "mbr_kiritimatikiritimatikiriti", timeZone: "Pacific/Kiritimati" };
const near = { ...someone, id: "mbr_parisparisparisparisparisp", timeZone: "Europe/Paris" };

// Deadlines are calendar days (a date column); the reminder is an instant.
const tasks = [{ name: "Report", due: "2026-10-05" }, { name: "Invoice", due: "2026-10-06" }];
const remindAt = new Date("2026-10-05T19:00:00Z"); // 09:00 in Kiritimati, 21:00 in Paris

let chest, database, sdkChest;
before(async () => {
  chest = await fakeChest({ members: [far, near], chest: { timeZone: "Europe/Paris" } });
  database = await testDatabase({ migrations: "test/no-migrations" });
  ({ chest: sdkChest } = await import("@argentic/chest-sdk/chest"));
});
after(async () => { await database.close(); await chest.close(); });

const app = createApp({ actions: {}, islands: {}, locales: ["en", "fr"], words: () => words, layouts: { members: ({ children }) => h("main", null, children), public: ({ children }) => h("main", null, children) } });
// "Due today" at a given instant (the page reads it from the address so the
// test can stand near midnight; a tool calls chest.today() without one).
app.get("/chest/due", page(({ f, query }) => {
  const today = sdkChest.today(new Date(query("at") ?? Date.now()));
  return {
    title: "Due",
    body: h("div", null,
      h("p", { id: "today" }, f.day(today)),
      h("ul", null, tasks.filter(t => t.due === today).map(t => h("li", { key: t.name }, `${t.name} ${f.day(t.due)}`))),
      h("p", { id: "remind" }, f.time(remindAt))),
  };
}));
const read = async (path, who) => (await app.fetch(withMember(new Request(`https://tool.test${path}`), who))).text();
// A day of 2026 says its year once 2026 is over: compared without it.
const plain = s => s?.replace(/ 2026$/u, "");
const text = (html, id) => plain(new RegExp(`<p id="${id}">([^<]*)</p>`, "u").exec(html)?.[1]);
const items = html => [...html.matchAll(/<li>([^<]*)<\/li>/gu)].map(m => plain(m[1]));

test("near midnight in Paris, a member already on the next day in Kiritimati: 'due today' is the company's day", async () => {
  const at = "2026-10-05T21:30:00Z"; // 23:30 on the 5th in Paris, 11:30 on the 6th in Kiritimati
  assert.equal(sdkChest.today(new Date(at)), "2026-10-05");
  const theirs = await read(`/chest/due?at=${at}`, far), ours = await read(`/chest/due?at=${at}`, near);
  assert.deepEqual(items(theirs), ["Report Mon 5 Oct"], "the member far ahead sees the company's day's deadlines");
  assert.deepEqual(items(ours), items(theirs), "every member, the same 'today'");
  assert.equal(text(theirs, "today"), "Mon 5 Oct");
  // A minute past midnight in Paris: the next day for everyone at once.
  const next = await read("/chest/due?at=2026-10-05T22:01:00Z", far);
  assert.deepEqual(items(next), ["Invoice Tue 6 Oct"]);
});

test("the database's day is the company's: current_date is chest.today()", async () => {
  const [{ day }] = await db()`select current_date::text as day`;
  assert.equal(day, sdkChest.today());
  assert.equal(sdkChest.timeZone, "Europe/Paris");
});

test("a personal reminder at 09:00 follows the member: an hourly run picks each one at their own 09:00, shown at 09:00 on their clock", async () => {
  const hours = Array.from({ length: 24 }, (_, i) => new Date(Date.UTC(2026, 9, 5, i)));
  const due = who => hours.filter(at => hourIn(who.timeZone, at) === 9).map(at => at.toISOString());
  assert.deepEqual(due(far), ["2026-10-05T19:00:00.000Z"]);
  assert.deepEqual(due(near), ["2026-10-05T07:00:00.000Z"]);
  assert.equal(text(await read("/chest/due", far), "remind"), "09:00", "the instant on the member's clock");
  assert.equal(text(await read("/chest/due", near), "remind"), "21:00");
});

test("a calendar day is the same day in every zone; an instant is the reader's", () => {
  const zones = ["Pacific/Kiritimati", "Europe/Paris", "America/Los_Angeles", "Pacific/Pago_Pago"];
  assert.deepEqual(zones.map(zone => plain(formatter("en", zone).day("2026-10-05"))), zones.map(() => "Mon 5 Oct"));
  assert.deepEqual(zones.map(zone => plain(formatter("fr", zone).day("2026-10-05"))), zones.map(() => "lun. 5 oct."));
  const at = new Date("2026-10-05T21:30:00Z");
  assert.deepEqual(zones.map(zone => formatter("en", zone).date(at)), ["6 Oct 2026", "5 Oct 2026", "5 Oct 2026", "5 Oct 2026"]);
  assert.throws(() => formatter("en", "Europe/Paris").date("2026-10-05"), RangeError, "a day is not an instant: f.day, never f.date");
  assert.equal("today" in formatter("en", "Pacific/Kiritimati"), false, "no reader's 'today': chest.today() is the only one");
});
