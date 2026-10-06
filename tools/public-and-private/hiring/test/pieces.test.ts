import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import { atLeast } from "@argentic/chest-app/testing";
import { en } from "../src/i18n/en.ts";
import { fr } from "../src/i18n/fr.ts";
import { sniffImage } from "../src/lib/brand.ts";
import { busySnapshot, readBusy } from "../src/lib/busy-snapshot.ts";
import * as candidates from "../src/lib/candidates.ts";
import { brandOf, imagePath, retentionWords } from "../src/lib/careers.ts";
import { countryNames } from "../src/lib/countries.ts";
import { db } from "../src/lib/db.ts";
import { brandImage, cvFile, downloadLimits, downloadsInFlight, messageFile } from "../src/lib/downloads.ts";
import * as jobs from "../src/lib/jobs.ts";
import { received } from "../src/lib/mail-in.ts";
import { confirmation, greeted } from "../src/lib/mailer.ts";
import * as cvs from "../src/lib/cv.ts";
import { cut } from "../src/lib/notify.ts";
import { nameOf, people } from "../src/lib/people.ts";
import { companyOf } from "../src/lib/public-feed.ts";
import { publicOrigin, teamOrigin } from "../src/lib/public-origin.ts";
import { sign, verify } from "../src/lib/signature.ts";
import { teammates } from "../src/lib/team.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { application, openJob } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, lea } from "./support/members.ts";

// The smaller rule modules, each on what it promises.
atLeast(8);
let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  chest = await fakeChest({
    tool: "hiring", network: {}, members: everyone, capabilities: ["members", "files", "notifications", "mail"],
    former: [{ id: "mbr_paulaaaaaaaaaaaaaaaaaaaaaa", name: "Paul Lefèvre", status: "no_access" }],
    storage: { publicUploads: true, publicFiles: true },
    chest: { timeZone: "Europe/Paris", organization: "Atelier Martin", language: "en", publicUrl: "https://careers.atelier-martin.fr" },
  });
  database = await testDatabase();
});
after(async () => {
  await database.close();
  await chest.close();
});

const recruiter = () => asMember(camille);
const pdf = new TextEncoder().encode("%PDF-1.4\n%%EOF\n");

test("links for people outside start with the Chest's public address — the company's own domain once connected", () => {
  assert.equal(publicOrigin(), "https://careers.atelier-martin.fr");
  assert.equal(teamOrigin(), "https://hiring-chest.chest.test");
  const s = { companyName: "Atelier Martin", website: "https://atelier.example", logo: { object: "public/brand/0123456789abcdef0123.png", version: "7" } } as jobs.Settings;
  assert.equal(imagePath(s.logo!), "/_chest/public/brand/0123456789abcdef0123.png?v=7", "a path of the host the page is on");
  assert.equal(companyOf(s, "https://careers.atelier-martin.fr").logo, "https://careers.atelier-martin.fr/_chest/public/brand/0123456789abcdef0123.png?v=7");
  assert.deepEqual(brandOf({ ...s, photos: [], accent: "forest" } as unknown as jobs.Settings), { logo: "/_chest/public/brand/0123456789abcdef0123.png?v=7", photos: [], website: "https://atelier.example", accent: "forest" });
  assert.equal(retentionWords(en, 6), en.retention.m6);
  assert.equal(retentionWords(fr, 24), fr.retention.m24);
});

test("names of members: former and without access say so, in the reader's words", async () => {
  const found = await people([camille.id, "mbr_paulaaaaaaaaaaaaaaaaaaaaaa", "mbr_nobodyaaaaaaaaaaaaaaaaaaaa", "mbr_short", "not-an-id"]);
  assert.equal(nameOf(found.get(camille.id), "en"), "Camille Martin");
  assert.equal(nameOf(found.get("mbr_paulaaaaaaaaaaaaaaaaaaaaaa"), "en"), "Paul Lefèvre (no access)");
  assert.equal(nameOf(found.get("mbr_paulaaaaaaaaaaaaaaaaaaaaaa"), "fr"), "Paul Lefèvre (sans accès)");
  assert.equal(nameOf(found.get("mbr_nobodyaaaaaaaaaaaaaaaaaaaa"), "en"), en.people.unknown);
  assert.equal(found.has("not-an-id") || found.has("mbr_short"), false, "a malformed id is never asked (it would fail the whole question)");
  assert.deepEqual((await teammates()).map(m => m.id).sort(), everyone.map(m => m.id).sort());
});

test("countries in the reader's language, sorted for them", () => {
  const french = countryNames("fr");
  assert.equal(french.find(([c]) => c === "DE")?.[1], "Allemagne");
  assert.ok(french.findIndex(([c]) => c === "DE") < french.findIndex(([c]) => c === "FR"));
  assert.equal(countryNames("en").find(([c]) => c === "GB")?.[1], "United Kingdom");
});

test("small pieces: a bell's text is cut, images known by their first bytes, the tool's signatures", () => {
  assert.equal(cut("Bastien  Leroy\n — a long name that goes on", 12), "Bastien Ler…");
  assert.equal([...cut("🙂".repeat(100), 80)].length, 80);
  assert.equal(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(sniffImage(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
  assert.equal(sniffImage(new TextEncoder().encode("<svg")), null);
  const s = sign("cv", "team.abc");
  assert.equal(verify("cv", "team.abc", s), true);
  assert.equal(verify("image", "team.abc", s), false, "one purpose, one key");
  assert.equal(verify("cv", "team.abd", s), false);
});

test("busy times another tool tells are read with their bounds; Hiring tells times only", () => {
  const now = Date.parse("2026-10-06T08:00:00Z");
  const snap = busySnapshot(hugo.id, [{ start: now + 3600_000, end: now + 7200_000 }], now);
  assert.deepEqual(Object.keys(snap).sort(), ["at", "from", "member", "spans", "to", "v"]);
  const read = readBusy(snap);
  assert.equal(read?.member, hugo.id);
  assert.equal(read?.spans.length, 1);
  assert.equal(readBusy({ v: 1, member: hugo.id, spans: "all day" }), null);
  assert.equal(readBusy({ v: 2 }), null);
});

test("a CV is served to whoever sees the candidate, two at a time at most, inline in a sandbox", async () => {
  const sql = db();
  const job = await openJob(sql, recruiter(), "Downloads");
  await jobs.addInterviewer(sql, recruiter(), job.id, ines.id, async () => true);
  chest.files.set("cv/0123456789abcdef0123.pdf", { data: pdf, type: "application/pdf", updated: new Date().toISOString() });
  const { candidate: c } = await candidates.apply(sql, application(job.slug, { cv: { object: "cv/0123456789abcdef0123.pdf", fileName: "Lucie CV.pdf", type: "application/pdf", size: pdf.length } }));
  const first = await cvFile(sql, asMember(ines), c.id, false);
  assert.equal(first.status, 200);
  assert.match(first.headers.get("content-disposition") ?? "", /^inline; filename="Lucie CV\.pdf"/u);
  assert.equal(first.headers.get("content-security-policy"), "sandbox; default-src 'none'; frame-ancestors 'self'");
  assert.equal(first.headers.get("cache-control"), "private, no-store");
  const second = await cvFile(sql, recruiter(), c.id, true);
  assert.match(second.headers.get("content-disposition") ?? "", /^attachment;/u);
  assert.equal(downloadsInFlight(), downloadLimits.inFlight);
  // Two on their way: the third waits its turn (the file is never read
  // a third time in memory).
  const third = await cvFile(sql, recruiter(), c.id, false);
  assert.equal(third.status, 503);
  assert.equal(third.headers.get("retry-after"), String(downloadLimits.retryAfter));
  assert.deepEqual(new Uint8Array(await first.arrayBuffer()), pdf);
  assert.equal(downloadsInFlight(), 1, "a slot given back once its last byte left");
  await second.body?.cancel();
  assert.equal(downloadsInFlight(), 0, "and when the download is cancelled");
  // Nobody else: an interviewer not on the job, or a file of an email for
  // an interviewer (recruiters only).
  assert.equal((await cvFile(sql, asMember(lea), c.id, false)).status, 404);
  const [m] = await sql<{ id: string }[]>`insert into messages (candidate_id, direction, kind, subject, body, status, attachments) values (${c.id}, 'in', 'message', 'CV', 'here', 'received', ${sql.json([{ file: "cv/0123456789abcdef0123.pdf", name: "x.pdf", type: "application/pdf", size: 1 }] as never)}) returning id`;
  assert.equal((await messageFile(sql, asMember(ines), m!.id, "0")).status, 403);
  const file = await messageFile(sql, recruiter(), m!.id, "0");
  assert.equal(file.headers.get("content-type"), "application/octet-stream");
  assert.match(file.headers.get("content-disposition") ?? "", /^attachment;/u);
  await file.arrayBuffer();
  assert.equal((await messageFile(sql, recruiter(), m!.id, "7")).status, 404);
});

test("a careers image on the team's Settings: a link the Chest signs, for an image the page holds only", async () => {
  chest.files.set("public/brand/0123456789abcdef0123.png", { data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), type: "image/png", updated: new Date().toISOString() });
  const shown = await brandImage(recruiter(), "public/brand/0123456789abcdef0123.png", ["public/brand/0123456789abcdef0123.png"]);
  assert.equal(shown.status, 303);
  assert.match(shown.headers.get("location") ?? "", /\/_chest\/files\//u);
  assert.equal((await brandImage(recruiter(), "public/brand/ffffffffffffffffffff.png", ["public/brand/0123456789abcdef0123.png"])).status, 404);
  assert.equal((await brandImage(asMember(ines), "public/brand/0123456789abcdef0123.png", ["public/brand/0123456789abcdef0123.png"])).status, 404);
});

test("a received email lands with its candidate by its thread, once", async () => {
  const sql = db();
  const job = await openJob(sql, recruiter(), "Mail in");
  const { candidate: c } = await candidates.apply(sql, application(job.slug, { email: "zoe@example.com" }));
  const message = { id: "rcv_" + "z".repeat(26), mailbox: "jobs", thread: "c" + c.id, from: { address: "zoe@example.com", name: "Zoé" }, to: "jobs@atelier.test", subject: "Re", text: "Thanks", html: null, messageId: "<m1@example.com>", inReplyTo: null, references: [], attachments: [], original: null, authenticated: true, auto: false, receivedAt: new Date().toISOString() };
  assert.deepEqual(await received(sql, message as never), { candidate: c.id, created: true });
  assert.deepEqual(await received(sql, message as never), { candidate: c.id, created: false });
  assert.deepEqual(await received(sql, { ...message, id: "rcv_" + "y".repeat(26), mailbox: "other" } as never), { candidate: null, created: false });
});

test("the confirmation greets with a first name only, never a link or an address someone typed as their name", () => {
  assert.equal(greeted("Zoé Martin"), "Zoé");
  assert.equal(greeted("  Jean-Éric d’Albret "), "Jean-Éric");
  assert.equal(greeted("O’Brien"), "O’Brien");
  assert.equal(greeted("J. R. Tolkien"), null, "an initial is no name to greet: plain Hello");
  for (const name of ["Visit spam.example", "Win at win@spam.example", "http://spam.example win", "www.spam.example", "buy@spam.example now", "Click: here", "A".repeat(31), "1234", ""]) assert.equal(greeted(name), null, name);
  const spam = confirmation({ name: "Visit https://spam.example/now for money", language: "en" }, { title: "Designer" }, "Atelier Martin", "https://careers.atelier-martin.fr");
  assert.ok(spam.text.startsWith("Hello,\n\n") && !spam.text.includes("spam"), spam.text);
  const zoe = confirmation({ name: "Zoé Martin", language: "fr" }, { title: "Designer" }, "Atelier Martin", null);
  assert.ok(zoe.text.startsWith("Bonjour Zoé,\n\n") && !zoe.text.includes("Martin,"), zoe.text);
});

test("a file the Chest could not delete is kept and deleted by the next cleanup: an erased CV never survives silently", async () => {
  const sql = db();
  const name = "cv/00112233445566778899.pdf";
  chest.files.set(name, { data: pdf, type: "application/pdf", updated: new Date().toISOString() });
  const api = process.env["CHEST_API"];
  process.env["CHEST_API"] = "http://127.0.0.1:9";
  try {
    await cvs.remove([name, "not/ours.txt"]);
  } finally {
    process.env["CHEST_API"] = api;
  }
  assert.deepEqual((await sql<{ object: string }[]>`select object from files_gone`).map(r => r.object), [name], "kept, only the tool's own");
  assert.ok(chest.files.has(name), "still at the Chest");
  assert.deepEqual(await cvs.removeLeft(sql), { removed: 1, left: 0 });
  assert.equal(chest.files.has(name), false);
  // Already gone counts as done.
  await sql`insert into files_gone (object) values (${name})`;
  assert.deepEqual(await cvs.removeLeft(sql), { removed: 1, left: 0 });
});
