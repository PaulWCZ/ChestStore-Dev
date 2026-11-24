import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { connect } from "@argentic/chest-sdk/realtime/client";
import { fakeChest, type FakeChest } from "@argentic/chest-sdk/testing";
import * as candidates from "../src/lib/candidates.ts";
import * as jobs from "../src/lib/jobs.ts";
import { erase } from "../src/lib/lifecycle.ts";
import { admit, visibleJobs } from "../src/lib/live.ts";
import { testDatabase, type TestDatabase } from "./support/db.ts";
import { application, openJob } from "./support/fixtures.ts";
import { asMember } from "./support/member.ts";
import { camille, everyone, hugo, ines, sofia } from "./support/members.ts";
import { built } from "./support/app.ts";

// Each job has its channel, "job:<id>", fed with its rows and its
// candidates' (an id alone), joined only by who sees the job — a
// recruiter, an interviewer on it — through the table job_live
// (chest.json's "join", src/lib/live.ts).

const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "..", "chest.json"), "utf8"));
// Who is in job_live, as the Chest reads it at each join (a snapshot the
// tests take after Hiring wrote it: the fake's check is synchronous).
let tickets = new Set<string>();
const snapshot = async () => {
  tickets = new Set((await database.sql<{ job_id: string; member_id: string }[]>`select job_id, member_id from job_live`).map(r => `${r.job_id}|${r.member_id}`));
};
const membership = (table: string, key: string, member: string) => table === "job_live" && tickets.has(`${key}|${member}`);
const events = (request: Request) => built().then(app => app.fetch(request));

let database: TestDatabase;
let chest: FakeChest;
before(async () => {
  database = await testDatabase();
  chest = await fakeChest({ members: everyone, capabilities: ["members", "files", "notifications", "sealed", "realtime"], realtime: { ...manifest.realtime, membership } });
});
after(async () => {
  await chest.close();
  await database.close();
});

const hasTool = async () => true;
const rows = async (jobId: string) => (await database.sql<{ member_id: string }[]>`select member_id from job_live where job_id = ${jobId} order by member_id`).map(r => r.member_id);

test("chest.json: one channel per job, joined through job_live; every feed on it, ids only", () => {
  assert.deepEqual(manifest.realtime.channels, [{ name: "job:{id}", join: { table: "job_live", key: "job_id", member: "member_id" } }]);
  for (const feed of manifest.realtime.feeds as { table: string; channel: string; columns: string[] }[]) {
    assert.equal(feed.channel, feed.table === "jobs" ? "job:{id}" : "job:{job_id}", feed.table);
    assert.deepEqual(feed.columns, ["id"]);
  }
});

test("what is written about a candidate carries their job, so its feed reaches the job's channel only", async () => {
  const { sql } = database;
  const job = await openJob(sql, asMember(camille), "Carpenter " + Math.random());
  const c = (await candidates.apply(sql, application(job.slug))).candidate;
  const note = await candidates.addNote(sql, asMember(camille), c.id, "Strong portfolio");
  const [row] = await sql<{ job_id: string }[]>`select job_id from notes where id = ${note.id}`;
  assert.equal(String(row!.job_id), job.id);
  const before = chest.realtime.published.length;
  chest.realtime.commit("notes", "insert", { id: note.id, job_id: job.id, candidate_id: c.id });
  assert.deepEqual(chest.realtime.published.slice(before).map(p => [p.channel, p.payload]), [[`job:${job.id}`, { id: note.id }]]);
});

test("a job's channel: only recruiters and its interviewers join; taken off, a role change, a departure or an erasure take them out", async () => {
  const { sql } = database;
  const job = await openJob(sql, asMember(camille), "Designer " + Math.random());
  await jobs.addInterviewer(sql, asMember(camille), job.id, hugo.id, hasTool);
  // What each one's pages follow: a recruiter every job, an interviewer theirs.
  assert.ok((await visibleJobs(sql, asMember(sofia))).some(j => j.id === job.id));
  assert.ok((await visibleJobs(sql, asMember(hugo))).some(j => j.id === job.id));
  assert.ok(!(await visibleJobs(sql, asMember(ines))).some(j => j.id === job.id), "Inès is not on it");
  await assert.rejects(jobs.job(sql, asMember(ines), job.id), /not_found/u);
  const mark = (await admit(sql, [job.id], hugo.id))[0]!.ticket;
  assert.equal((await admit(sql, [job.id], hugo.id))[0]!.ticket, mark, "let in once: the same mark");
  await snapshot();
  const screens = [ines, hugo, sofia].map(m => connect({ url: chest.realtime.url(m.id) }));
  try {
    const outcome = (screen: ReturnType<typeof connect>) => new Promise<string>(resolve => {
      const ch = screen.channel(`job:${job.id}`);
      ch.onJoined(() => resolve("joined"));
      ch.onRefused(code => resolve(code));
    });
    assert.equal(await outcome(screens[0]!), "forbidden", "Inès is refused: nothing of a job she is not on");
    assert.equal(await outcome(screens[1]!), "joined", "Hugo, on it, joins");
    assert.equal(await outcome(screens[2]!), "joined", "Sofia, a recruiter, joins");
  } finally {
    for (const screen of screens) screen.close();
  }
  assert.deepEqual(await rows(job.id), [hugo.id, sofia.id].sort());
  // Taken off the job: out; the recruiter stays.
  await jobs.removeInterviewer(sql, asMember(camille), job.id, hugo.id);
  assert.deepEqual(await rows(job.id), [sofia.id]);
  // A role change (member.updated): out; a name: not.
  const deliver = async (event: Record<string, unknown>) => assert.equal(await chest.deliver(event as never, events), 204);
  await deliver({ type: "member.updated", data: { id: sofia.id, changed: ["name"] } });
  assert.deepEqual(await rows(job.id), [sofia.id]);
  await deliver({ type: "member.updated", data: { id: sofia.id, changed: ["role"] } });
  assert.deepEqual(await rows(job.id), []);
  assert.notEqual((await admit(sql, [job.id], sofia.id))[0]!.ticket, "", "let in again at her next read");
  // Losing access, leaving, erasure: out.
  await jobs.addInterviewer(sql, asMember(camille), job.id, hugo.id, hasTool);
  await admit(sql, [job.id], hugo.id);
  await deliver({ type: "access.revoked", data: { id: hugo.id } });
  assert.deepEqual(await rows(job.id), [sofia.id]);
  await deliver({ type: "member.removed", data: { id: sofia.id } });
  assert.deepEqual(await rows(job.id), []);
  await admit(sql, [job.id], camille.id);
  await erase(sql, camille.id);
  assert.deepEqual(await rows(job.id), []);
});
