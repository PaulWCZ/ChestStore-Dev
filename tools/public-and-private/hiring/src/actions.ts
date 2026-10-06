import { chest } from "@argentic/chest-sdk/chest";
import { CapabilityNotGranted, ChestError } from "@argentic/chest-sdk/errors";
import type { Member } from "@argentic/chest-sdk/member";
import * as members from "@argentic/chest-sdk/members";
import { action, after, fail, field, publicAction, redirect, type Field } from "@argentic/chest-app";
import { localeOf } from "./i18n/index.ts";
import { can } from "./lib/access.ts";
import * as brand from "./lib/brand.ts";
import * as candidates from "./lib/candidates.ts";
import * as cv from "./lib/cv.ts";
import { db, type Sql } from "./lib/db.ts";
import { importRows, undoImport as undoImportRows } from "./lib/import.ts";
import * as interviews from "./lib/interviews.ts";
import * as jobs from "./lib/jobs.ts";
import * as mailer from "./lib/mailer.ts";
import * as messages from "./lib/messages.ts";
import * as outbox from "./lib/outbox.ts";
import { people as peopleOf } from "./lib/people.ts";
import { publicOrigin } from "./lib/public-origin.ts";
import * as selfSchedule from "./lib/self-schedule.ts";
import * as share from "./lib/share.ts";
import * as tell from "./lib/tell.ts";
import { AppError } from "./shared/app-error.ts";
import { meetingTime } from "./shared/format.ts";
import { isCandidateReason, jobStates, languages, limits, memberPattern, recommendations, rejectReasons } from "./shared/model.ts";
import { timeOf } from "./shared/time.ts";

// Every change of Hiring, by name: POST /chest/actions/<name> for the team
// (each reads the member from the Chest's assertion), /actions/<name> for
// the careers page (publicAction: no member, bounded). The fields say what
// may come in — an id, a member's id, a day, a choice, a text and its
// bound — and refuse anything else at the door (a code, in the reader's
// words); the rules of src/lib/ then check who may do it, and their own
// rules, before anything is written (a candidate of a job someone may not
// see does not exist for them). A structured value an island sends (a
// job, the settings, an interview) is a json() the rule reads key by key.
//
// The package runs a page's actions one at a time; a rule that reads then
// writes does it in one transaction holding a row lock (a candidate, a
// job, an interview link), for two people at once.

const ref = field.id;
// A member's id (mbr_ + 26 letters and digits).
const person = (): Field<string> => ({ read: value => (typeof value === "string" && memberPattern.test(value) ? value : fail("invalid")) });
// Text the rule bounds again with its own code; "" allowed.
const words = (max: number) => field.text({ min: 0, max });
const ids = (max: number = limits.bulk) => field.list(ref(), max);
// An upload's type and size, as the browser says them (checked by the rule).
const upload = { type: field.text({ max: 120 }), size: field.int({ min: 1, max: 1 << 30 }) };

// What the Chest says of a member: they have the tool; they recruit.
async function ask<T>(question: () => Promise<T>): Promise<T> {
  try {
    return await question();
  } catch (error) {
    if (error instanceof ChestError) fail("unavailable");
    throw error;
  }
}
const hasTool = (memberId: string) => ask(async () => (await members.get(memberId)) !== null);
const isRecruiter = (memberId: string) => ask(async () => (await members.get(memberId))?.role === "recruiter");
// Who may be on a candidate's interview: the job's interviewers, and the
// recruiters (the Chest says their role).
async function isTeam(memberId: string, jobId: string): Promise<boolean> {
  const [on] = await db()<{ x: number }[]>`select 1 as x from job_interviewers where job_id = ${jobId} and member_id = ${memberId}`;
  return on !== undefined || (await isRecruiter(memberId));
}

// The tile's numbers, once the answer is sent (never in an action's way).
const badges = () => after("badges", () => tell.refreshBadges(db()));

// each runs one change per candidate of a bulk action: one refused (an
// AppError: erased meanwhile, not the reader's) is counted and the others
// go on; anything else stops the rest, which are counted as failed too —
// unless nothing was done yet, then it is the action's error.
async function each(list: readonly string[], done: readonly string[], run: (id: string) => Promise<void>): Promise<number> {
  let failed = 0;
  for (const [i, id] of list.entries()) {
    try {
      await run(id);
    } catch (error) {
      if (error instanceof AppError) failed++;
      else if (done.length === 0) throw error;
      else return failed + list.length - i;
    }
  }
  return failed;
}

// The public actions' bounds, a day in the Chest's zone (the package's
// bound: per visitor — a cookie, no Chest names visitors yet —, per
// subject and for everyone). Per job: a flood on one job's form closes
// that job for the day and leaves the others open, until everyone's total;
// the numbers are the most a company of up to 200 people reads in a day,
// not what a busy day brings (README "Visitors").
export const publicBounds = {
  upload: { perVisitor: 20, perSubject: 120, perDay: 1500 },
  apply: { perVisitor: 20, perSubject: 60, perDay: 600 },
  choose: { perVisitor: 30, perSubject: 10, perDay: 500 },
  release: { perVisitor: 10, perSubject: 4, perDay: 200 },
  // A secret that names no link: its own budget, never a link's.
  unknown: { perVisitor: 30, perDay: 1000 },
} as const;

// Tells People of a hire (or of one taken back): Proposal (studio), events
// between tools; nothing is told when the Chest cannot take it.
async function tellHired(sql: Sql, actor: Member, c: candidates.Candidate): Promise<void> {
  const [job] = await sql<{ title: string; team: string; place: string }[]>`select title, team, place from jobs where id = ${c.jobId}`;
  await share.hired({ candidate: c.id, name: c.name, email: c.email, job: job!.title, team: job!.team, place: job!.place, startDate: c.startDate, hiredBy: actor.id }, c.stageEnteredAt);
}

// restoreOne brings a rejected candidate back (Bring back, or the Undo of
// a rejection): back on their interviewers' calendars, and People told
// again when they were hired.
async function restoreOne(sql: Sql, actor: Member, candidateId: string): Promise<void> {
  const before = await candidates.load(sql, actor, candidateId);
  const c = await candidates.restore(sql, actor, candidateId);
  await interviews.requeue(sql, { candidate: c.id });
  if (before.candidate.status === "rejected" && (await candidates.isHiredStage(sql, c.stageId))) await tellHired(sql, actor, { ...c, stageEnteredAt: new Date().toISOString() });
}

type Delivery = "sent" | "none" | "waiting" | "skipped";

export const actions = {
  // ---- Jobs ------------------------------------------------------------------
  createJob: action({ job: field.json() }, async ({ job }, { member }): Promise<{ id: string }> => ({ id: (await jobs.createJob(db(), member, job as jobs.JobInput)).id })),
  duplicateJob: action({ id: ref() }, async ({ id }, { member }): Promise<{ id: string }> => ({ id: (await jobs.duplicateJob(db(), member, id)).id })),
  updateJob: action({ id: ref(), job: field.json() }, async ({ id, job }, { member }): Promise<null> => {
    await jobs.updateJob(db(), member, id, job as jobs.JobInput);
    return null;
  }),
  setJobState: action({ id: ref(), state: field.choice(jobStates) }, async ({ id, state }, { member }): Promise<{ previous: string }> => ({ previous: (await jobs.setJobState(db(), member, id, state)).previous })),
  removeJob: action({ id: ref() }, async ({ id }, { member }): Promise<null> => {
    await jobs.removeJob(db(), member, id);
    redirect("/chest");
  }),
  addStage: action({ jobId: ref(), name: field.text({ max: limits.stageName }) }, async ({ jobId, name }, { member }): Promise<null> => {
    await jobs.addStage(db(), member, jobId, name);
    return null;
  }),
  renameStage: action({ id: ref(), name: field.text({ max: limits.stageName }) }, async ({ id, name }, { member }): Promise<null> => {
    await jobs.renameStage(db(), member, id, name);
    return null;
  }),
  moveStage: action({ id: ref(), direction: field.choice(["up", "down"] as const) }, async ({ id, direction }, { member }): Promise<null> => {
    await jobs.moveStage(db(), member, id, direction);
    return null;
  }),
  removeStage: action({ id: ref() }, async ({ id }, { member }): Promise<null> => {
    await jobs.removeStage(db(), member, id);
    return null;
  }),
  addInterviewer: action({ jobId: ref(), member: person() }, async ({ jobId, member: who }, { member }): Promise<null> => {
    await jobs.addInterviewer(db(), member, jobId, who, hasTool);
    return null;
  }),
  removeInterviewer: action({ jobId: ref(), member: person() }, async ({ jobId, member: who }, { member }): Promise<null> => {
    await jobs.removeInterviewer(db(), member, jobId, who);
    return null;
  }),

  // ---- The careers page's settings -----------------------------------------
  saveSettings: action({ settings: field.json() }, async ({ settings }, { member }): Promise<null> => {
    await jobs.saveSettings(db(), member, settings as jobs.SettingsInput);
    return null;
  }),
  // One image for the careers page (a logo, a photo): an upload address
  // the Chest accepts once, on the team host.
  imageUpload: action(upload, async ({ type, size }, { member }): Promise<{ url: string; ticket: string }> => {
    if (!can(member, "settings")) fail("forbidden");
    return brand.grantImage(type, size);
  }, { parallel: true }),
  // The careers page's logo or photos: the image the browser sent is
  // checked and published, then recorded; images no longer shown are
  // deleted. keep: the photos to keep, in order, plus the new one.
  setBrandImage: action({ which: field.choice(["logo", "photos"] as const), ticket: field.optional(field.text({ max: 300 })), keep: field.list(field.text({ max: 300 }), limits.photos) }, async ({ which, ticket, keep }, { member }): Promise<null> => {
    if (!can(member, "settings")) fail("forbidden");
    const sql = db();
    const s = await jobs.settings(sql);
    const added = ticket ? await brand.acceptImage(ticket) : null;
    const kept = which === "photos" ? s.photos.filter(p => keep.includes(p.object)) : [];
    try {
      const unused = await jobs.setImages(sql, member, which, [...kept, ...(added ? [added] : [])]);
      await cv.remove(unused);
    } catch (error) {
      if (added) await cv.remove([added.object]);
      throw error;
    }
    return null;
  }),

  // ---- Candidates on the board ------------------------------------------------
  moveCandidate: action({ id: ref(), stage: ref(), startDate: field.optional(field.day()) }, async ({ id, stage, startDate }, { member }): Promise<{ from: string; hired: boolean }> => {
    const sql = db();
    const done = await candidates.move(sql, member, id, stage, startDate);
    if (done.to.hired && !done.from.hired) await tellHired(sql, member, done.candidate);
    if (done.from.hired && !done.to.hired) await share.hireCancelled(done.candidate.id);
    badges();
    return { from: done.from.id, hired: done.to.hired && !done.from.hired };
  }),
  // rejectCandidate records the rejection, then queues the email the
  // recruiter wrote, when they asked for it: it leaves only once the Undo
  // of the toast is over (messages.undoSeconds) — Undo cancels it before
  // anything left.
  rejectCandidate: action({ id: ref(), reason: field.choice(rejectReasons), note: words(limits.rejectNote), send: field.bool(), text: words(limits.emailText) }, async ({ id, reason, note, send, text }, { member }): Promise<{ delivery: "waiting" | "skipped"; seconds: number; at: string }> => {
    const sql = db();
    const at = new Date(Date.now() - 1000).toISOString();
    const before = await candidates.load(sql, member, id);
    const c = await candidates.reject(sql, member, id, reason, note);
    if (before.candidate.status === "active" && (await candidates.isHiredStage(sql, c.stageId))) await share.hireCancelled(c.id);
    await interviews.requeue(sql, { candidate: c.id });
    after("rejected told", () => tell.settled(c.id));
    badges();
    if (!send || isCandidateReason(reason) || before.candidate.status !== "active") return { delivery: "skipped", seconds: 0, at };
    if (text.trim() === "") fail("empty");
    const s = await jobs.settings(sql);
    const [job] = await sql<{ title: string }[]>`select title from jobs where id = ${c.jobId}`;
    const draft = mailer.rejectionDraft(c, job!, s.companyName, member.firstName || member.name);
    await messages.queue(sql, member, c.id, { kind: "rejection", subject: draft.subject, text, delaySeconds: messages.undoSeconds });
    return { delivery: "waiting", seconds: messages.undoSeconds, at };
  }),
  // bulkReject rejects several candidates of a job with one reason, each
  // with the rejection email in their own language when asked — every
  // email waiting for the Undo like one rejection's. Says who was rejected.
  // One that cannot be rejected (erased meanwhile, no longer the
  // reader's) does not undo the others: the answer says how many failed.
  bulkReject: action({ ids: ids(), reason: field.choice(rejectReasons), send: field.bool() }, async ({ ids: list, reason, send }, { member }): Promise<{ done: string[]; failed: number; seconds: number; at: string }> => {
    const sql = db();
    const at = new Date(Date.now() - 1000).toISOString();
    if (list.length === 0) fail("invalid");
    const s = await jobs.settings(sql);
    const done: string[] = [];
    const failed = await each(list, done, async id => {
      const before = await candidates.load(sql, member, id);
      if (before.candidate.status !== "active") return;
      const c = await candidates.reject(sql, member, id, reason, "");
      if (await candidates.isHiredStage(sql, c.stageId)) await share.hireCancelled(c.id);
      await interviews.requeue(sql, { candidate: c.id });
      if (send && !isCandidateReason(reason)) {
        const [job] = await sql<{ title: string }[]>`select title from jobs where id = ${c.jobId}`;
        const draft = mailer.rejectionDraft(c, job!, s.companyName, member.firstName || member.name);
        await messages.queue(sql, member, c.id, { kind: "rejection", subject: draft.subject, text: draft.text, delaySeconds: messages.undoSeconds });
      }
      done.push(c.id);
    });
    after("rejected told", async () => { for (const id of done) await tell.settled(id); });
    badges();
    return { done, failed, seconds: messages.undoSeconds, at };
  }),
  // undoReject: the Undo of a rejection, of one candidate or several. They
  // are back where they were, and their rejection emails still waiting
  // never leave. Says how many had already left since the rejection (the
  // toast was held open past its time), so the Undo tells the truth.
  undoReject: action({ ids: ids(), since: field.text({ max: 40 }) }, async ({ ids: list, since }, { member }): Promise<{ left: number }> => {
    const sql = db();
    if (list.length === 0) fail("invalid");
    for (const id of list) await restoreOne(sql, member, id);
    badges();
    return { left: await messages.rejectionsSent(sql, member, list, since) };
  }),
  // rejectionsLeft: once the Undo of a rejection is over, send what is due
  // and say how many of these candidates' rejection emails left.
  rejectionsLeft: action({ ids: ids(), since: field.text({ max: 40 }) }, async ({ ids: list, since }, { member }): Promise<{ left: number }> => {
    const sql = db();
    const left = await messages.rejectionsSent(sql, member, list, since).then(() => outbox.flush(sql)).then(() => messages.rejectionsSent(sql, member, list, since));
    return { left };
  }),
  // bulkMove moves several candidates of a job to one stage (never into
  // "hired": each hire asks its first day). Says where each was, for Undo.
  bulkMove: action({ ids: ids(), stage: ref() }, async ({ ids: list, stage }, { member }): Promise<{ from: Record<string, string>; failed: number }> => {
    const sql = db();
    if (list.length === 0 || (await candidates.isHiredStage(sql, stage))) fail("invalid");
    const from: Record<string, string> = {};
    const moved: string[] = [];
    const failed = await each(list, moved, async id => {
      const done = await candidates.move(sql, member, id, stage);
      if (done.from.id !== done.to.id) from[id] = done.from.id;
      moved.push(id);
      if (done.from.hired && !done.to.hired) await share.hireCancelled(done.candidate.id);
    });
    badges();
    return { from, failed };
  }),
  // bulkMoveBack: the Undo of a bulk move (candidate → the stage it left).
  bulkMoveBack: action({ from: field.keyed(/^c([1-9][0-9]{0,17})$/u, ref(), limits.bulk) }, async ({ from }, { member }): Promise<null> => {
    const sql = db();
    for (const [id, stage] of Object.entries(from)) {
      const done = await candidates.move(sql, member, id, stage);
      if (done.to.hired && !done.from.hired) await tellHired(sql, member, done.candidate);
    }
    badges();
    return null;
  }),
  restoreCandidate: action({ id: ref() }, async ({ id }, { member }): Promise<null> => {
    await restoreOne(db(), member, id);
    badges();
    return null;
  }),

  // ---- A candidate's page ---------------------------------------------------
  addNote: action({ id: ref(), body: field.text({ max: limits.note }) }, async ({ id, body }, { member }): Promise<null> => {
    await candidates.addNote(db(), member, id, body);
    return null;
  }),
  removeNote: action({ id: ref() }, async ({ id }, { member }): Promise<null> => {
    await candidates.removeNote(db(), member, id);
    return null;
  }),
  giveFeedback: action({ id: ref(), rating: field.int({ min: 1, max: 4 }), recommendation: field.choice(recommendations), strengths: words(limits.feedbackText), concerns: words(limits.feedbackText) }, async ({ id, ...input }, { member }): Promise<null> => {
    const done = await candidates.giveFeedback(db(), member, id, input);
    after("feedback told", () => tell.gave(member, done.first ? done.askedBy : [], done.candidate));
    return null;
  }),
  askFeedback: action({ id: ref(), members: field.list(person(), limits.interviewers) }, async ({ id, members: list }, { member }): Promise<{ count: number }> => {
    const sql = db();
    const done = await candidates.askFeedback(sql, member, id, list, isRecruiter);
    const [job] = await sql<{ title: string }[]>`select title from jobs where id = ${done.candidate.jobId}`;
    after("asked told", () => tell.asked(member, done.asked, done.candidate, { title: job!.title }));
    return { count: done.asked.length };
  }),
  cancelAsk: action({ id: ref(), member: person() }, async ({ id, member: who }, { member }): Promise<null> => {
    await candidates.cancelAsk(db(), member, id, who);
    after("ask withdrawn", () => tell.withdrawAsk(id, who));
    return null;
  }),
  // A recruiter sends a CV (a referral's, a replaced one, a file for an
  // email): an upload address the Chest accepts once, on the team host,
  // and the tool's signed ticket for it.
  cvUpload: action(upload, async ({ type, size }, { member }): Promise<{ url: string; ticket: string }> => {
    if (!can(member, "candidates.manage")) fail("forbidden");
    try {
      const up = await cv.grant("team", type, size);
      return { url: up.url, ticket: up.ticket };
    } catch (error) {
      if (error instanceof CapabilityNotGranted) fail("unavailable");
      throw error;
    }
  }, { parallel: true }),
  addCandidate: action({
    jobId: ref(), name: field.text({ max: limits.name }), email: field.text({ max: limits.email }), phone: words(limits.phone), link: words(limits.link), coverLetter: words(limits.coverLetter),
    language: field.choice(languages), stage: field.optional(ref()), cv: field.optional(field.text({ max: 300 })), cvName: words(limits.fileName),
  }, async (input, { member }): Promise<{ id: string }> => {
    const sql = db();
    const file = input.cv ? await cv.accept(input.cv, "team", input.cvName) : null;
    try {
      const c = await candidates.addCandidate(sql, member, input.jobId, { ...input, stageId: input.stage, cv: file });
      badges();
      return { id: c.id };
    } catch (error) {
      if (file) await cv.remove([file.object]);
      throw error;
    }
  }),
  editCandidate: action({ id: ref(), name: field.text({ max: limits.name }), email: field.text({ max: limits.email }), phone: words(limits.phone), link: words(limits.link), language: field.choice(languages) }, async ({ id, ...input }, { member }): Promise<null> => {
    await candidates.editCandidate(db(), member, id, input);
    return null;
  }),
  setCv: action({ id: ref(), ticket: field.text({ max: 300 }), fileName: words(limits.fileName) }, async ({ id, ticket, fileName }, { member }): Promise<null> => {
    const sql = db();
    await candidates.manageable(sql, member, id);
    const file = await cv.accept(ticket, "team", fileName);
    try {
      const done = await candidates.setCv(sql, member, id, file);
      if (done.previous) await cv.remove([done.previous]);
    } catch (error) {
      await cv.remove([file.object]);
      throw error;
    }
    return null;
  }),
  considerFor: action({ id: ref(), job: ref() }, async ({ id, job }, { member }): Promise<{ id: string }> => {
    const copy = await candidates.considerFor(db(), member, id, job, cv.copy);
    badges();
    return { id: copy.id };
  }),
  setPool: action({ id: ref(), on: field.bool() }, async ({ id, on }, { member }): Promise<null> => {
    await candidates.setPool(db(), member, id, on);
    return null;
  }),
  eraseCandidate: action({ id: ref() }, async ({ id }, { member }): Promise<{ jobId: string }> => {
    const sql = db();
    const gone = await candidates.erase(sql, member, id);
    await cv.remove(gone.objects);
    if (gone.wasHired) await share.hireCancelled(id);
    after("erased told", async () => {
      await interviews.flushCalendars(db());
      await tell.forgotten(gone.notices);
    });
    badges();
    return { jobId: gone.jobId };
  }),

  // ---- Emails ---------------------------------------------------------------
  // writeTo sends a recruiter's email to a candidate now. Without mail on
  // this Chest, the email is kept as "not sent" and the page opens the
  // recruiter's own mail app with it (mailto:), then records it was
  // written there.
  writeTo: action({
    id: ref(), subject: field.text({ max: limits.subject }), text: field.text({ max: limits.emailText }),
    files: field.list(field.json(), messages.attachLimits.count), template: field.optional(ref()), templateFiles: field.list(field.text({ max: 120 }), messages.attachLimits.count),
  }, async ({ id, subject, text, files, template, templateFiles }, { member }): Promise<{ status: "sent" | "none" | "waiting"; message: string; to: string }> => {
    const sql = db();
    const message = await messages.write(sql, member, id, { subject, text, files, template, templateFiles });
    const status = await outbox.sendNow(sql, message);
    const [c] = await sql<{ email: string }[]>`select email from candidates where id = ${id}`;
    return { status, message, to: c?.email ?? "" };
  }),
  writtenOutside: action({ message: ref() }, async ({ message }, { member }): Promise<null> => {
    await messages.writtenOutside(db(), member, message);
    return null;
  }),
  saveTemplate: action({ template: field.json() }, async ({ template }, { member }): Promise<{ id: string }> => ({ id: (await messages.saveTemplate(db(), member, template as Parameters<typeof messages.saveTemplate>[2])).id })),
  removeTemplate: action({ id: ref() }, async ({ id }, { member }): Promise<null> => {
    await messages.removeTemplate(db(), member, id);
    return null;
  }),
  fileMessage: action({ message: ref(), candidate: ref() }, async ({ message, candidate }, { member }): Promise<null> => {
    await messages.file(db(), member, message, candidate);
    return null;
  }),
  removeMessage: action({ message: ref() }, async ({ message }, { member }): Promise<null> => {
    await cv.remove(await messages.remove(db(), member, message));
    return null;
  }),

  // ---- Interviews -----------------------------------------------------------
  scheduleInterview: action({ id: ref(), interview: field.json() }, async ({ id, interview }, { member }): Promise<{ status: Delivery }> => {
    const sql = db();
    const done = await interviews.schedule(sql, member, id, interview as interviews.InterviewInput, isTeam);
    const status = done.message ? await outbox.sendNow(sql, done.message) : "skipped";
    after("interview shared", async () => {
      await interviews.flushCalendars(db());
      // Booking hears these people are taken then (src/lib/share.ts).
      await share.shareBusy(db(), done.interview.people);
    });
    return { status };
  }),
  cancelInterview: action({ id: ref(), tell: field.bool() }, async ({ id, tell: told }, { member }): Promise<{ status: Delivery }> => {
    const sql = db();
    const done = await interviews.cancel(sql, member, id, told);
    const status = done.message ? await outbox.sendNow(sql, done.message) : "skipped";
    after("interview shared", async () => {
      await interviews.flushCalendars(db());
      await share.shareBusy(db(), done.interview.people);
    });
    return { status };
  }),
  // sendInterviewLink: the candidate chooses the time (src/lib/self-schedule.ts).
  // Says what became of the email, and the link (for a Chest without
  // email: the recruiter sends it themselves).
  sendInterviewLink: action({ id: ref(), link: field.json() }, async ({ id, link }, { member }): Promise<{ status: Delivery; link: string }> => {
    const sql = db();
    const done = await selfSchedule.send(sql, member, id, link as selfSchedule.RequestInput, isTeam, publicOrigin());
    const status = done.message ? await outbox.sendNow(sql, done.message) : "skipped";
    return { status, link: done.link };
  }),
  cancelInterviewLink: action({ id: ref() }, async ({ id }, { member }): Promise<null> => {
    await selfSchedule.cancel(db(), member, id);
    return null;
  }),
  // busyTimes: when these people are already busy on a day, as the
  // Chest's clock reads it ("09:30"): an interview here, a booking, a day
  // off (src/lib/interviews.ts busy). Asked while the recruiter chooses.
  busyTimes: action({ people: field.list(person(), limits.interviewPeople), day: field.day() }, async ({ people, day }, { member }): Promise<{ member: string; from: string; to: string; source: string | null }[]> => {
    const zone = chest.timeZone;
    return (await interviews.busy(db(), member, people, day)).map(b => ({ member: b.member, from: timeOf(b.start, zone), to: timeOf(b.end, zone), source: b.source ?? null }));
  }, { parallel: true }),

  // ---- Import ---------------------------------------------------------------
  importCandidates: action({ jobId: ref(), rows: field.json(), stages: field.json(), origin: words(80), language: field.choice(languages) }, async ({ jobId, ...input }, { member }): Promise<{ added: { id: string; email: string }[]; skipped: { line: number; reason: string }[] }> => {
    const done = await importRows(db(), member, jobId, input);
    badges();
    return done;
  }, { maxBody: 8 << 20, parallel: true }),
  undoImport: action({ ids: field.list(ref(), limits.importRows) }, async ({ ids: list }, { member }): Promise<null> => {
    await cv.remove(await undoImportRows(db(), member, list));
    badges();
    return null;
  }, { maxBody: 1 << 20 }),

  // ---- The careers page (public): anyone on the Internet may call these.
  // Their bounds (publicBounds, below the actions) are per job and per
  // interview link: a robot that floods one job's form closes that job's
  // form for the day, never the others' (README "Visitors").
  // They hold no member and reveal nothing but "received". The package
  // bounds each (publicAction's bound): the page's single-use form token,
  // the field only robots fill (<Honeypot />), so many calls a day per
  // visitor and for everyone, counted only once the call passed its own
  // checks (a refusal gives its count back). --------------------------------

  // One CV from a visitor, for an open job: an address on the host the
  // page is on (the company's own domain once connected), whose answer to
  // the browser is a claim (Proposal (studio): files.publicUploadUrl).
  // Without public uploads on this Chest: cv_off — the form asks for a
  // link instead.
  publicCvUpload: publicAction({ slug: field.text({ max: 80 }), ...upload }, async ({ slug, type, size }, { charge }): Promise<{ url: string }> => {
    const sql = db();
    const job = await candidates.openJob(sql, slug);
    await charge("upload", { subject: `job:${job.id}` });
    try {
      return { url: (await cv.publicGrant(type, size)).url };
    } catch (error) {
      if (error instanceof CapabilityNotGranted) fail("cv_off");
      throw error;
    }
  }, { bound: { budgets: { upload: publicBounds.upload }, formSeconds: 3 }, parallel: true }),

  // The application. Sent, the thank-you page (nothing of the candidate in
  // its address); a confirmation email in the candidate's language.
  apply: publicAction({
    slug: field.text({ max: 80 }), name: words(limits.name), email: words(limits.email), phone: words(limits.phone), link: words(limits.link), coverLetter: words(limits.coverLetter),
    cv: field.optional(field.text({ max: 200 })), cvName: words(limits.fileName), pool: field.bool(), lang: words(5),
    answers: field.keyed(/^answer:(q[a-z0-9]{1,12})$/u, words(limits.answer), limits.questions),
  }, async (input, { charge }): Promise<null> => {
    const sql = db();
    const job = await candidates.openJob(sql, input.slug);
    await charge("apply", { subject: `job:${job.id}` });
    const file = input.cv ? await cv.take(input.cv, input.cvName) : null;
    const { candidate } = await candidates.apply(sql, {
      slug: job.slug, name: input.name, email: input.email, phone: input.phone, link: input.link, coverLetter: input.coverLetter,
      pool: input.pool, answers: input.answers, language: localeOf(input.lang), cv: file,
    }).catch(async error => {
      if (file) await cv.remove([file.object]);
      throw error;
    });
    // The confirmation leaves from the jobs mailbox with the candidate's
    // thread address: if they answer it, their answer lands in their
    // history.
    const s = await jobs.settings(sql);
    const words2 = mailer.confirmation(candidate, job, s.companyName, publicOrigin());
    const message = await messages.queueConfirmation(sql, candidate.id, words2.subject, words2.text);
    const mailed = (await outbox.sendNow(sql, message)) === "sent";
    after("applied told", async () => {
      await tell.applied(candidate, job);
      await tell.refreshBadges(db());
    });
    redirect(`/${job.slug}/thanks${mailed ? "?mailed=1" : ""}`);
  }, { bound: { budgets: { apply: publicBounds.apply }, formSeconds: 3, work: true } }),

  // A candidate chooses their interview time, from the link they received
  // (/interview/<secret>): the secret is the only key; counted per link
  // once it is known. Then the page says when ("taken": the times left).
  // A secret that names no link spends a budget of its own and answers
  // "gone" without a refusal: guessing secrets never closes a real link.
  chooseTime: publicAction({ token: field.text({ max: 64 }), slot: field.text({ max: 20 }) }, async ({ token, slot }, { charge }): Promise<{ gone: true } | null> => {
    const sql = db();
    const link = await selfSchedule.known(sql, token);
    if (!link) {
      await charge("unknown");
      return { gone: true };
    }
    await charge("choose", { subject: link.id });
    const [day, time] = slot.split(" ");
    const done = await selfSchedule.choose(sql, token, { day, time }, async id => {
      const person = (await peopleOf([id])).get(id);
      return person && person.status === "member" ? { name: person.name, firstName: person.name.split(/\s+/u)[0] ?? person.name } : { name: "" };
    });
    await outbox.sendNow(sql, done.message);
    after("interview chosen told", async () => {
      await interviews.flushCalendars(db());
      await share.shareBusy(db(), done.interview.people);
      const zone = chest.timeZone;
      await tell.chosen([...new Set([...done.request.people, done.request.createdBy])].filter(id => id.startsWith("mbr_")), done.candidate, done.interview, (start, locale) => meetingTime(start, zone, locale));
    });
    return null;
  }, { bound: { budgets: { choose: publicBounds.choose, unknown: publicBounds.unknown } } }),

  // The candidate gives back the time they chose — to choose another, or
  // to call the interview off — from the same link, until it starts. The
  // people who meet them and who sent the link hear it.
  releaseTime: publicAction({ token: field.text({ max: 64 }), what: field.choice(["another", "off"] as const) }, async ({ token, what }, { charge }): Promise<{ gone: true } | null> => {
    const sql = db();
    const link = await selfSchedule.known(sql, token);
    if (!link) {
      await charge("unknown");
      return { gone: true };
    }
    await charge("release", { subject: link.id });
    const done = await selfSchedule.release(sql, token, what);
    after("interview given back told", async () => {
      await interviews.flushCalendars(db());
      await share.shareBusy(db(), done.interview.people);
      const zone = chest.timeZone;
      await tell.released([...new Set([...done.interview.people, done.request.createdBy])].filter(id => id.startsWith("mbr_")), done.candidate, done.interview, what, (start, locale) => meetingTime(start, zone, locale));
    });
    return null;
  }, { bound: { budgets: { release: publicBounds.release, unknown: publicBounds.unknown } } }),
};
