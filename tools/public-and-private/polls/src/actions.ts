import { action, fail, field, publicAction, redirect } from "./core/tool.ts";
import { emailGuests, syncFinal } from "./lib/agenda.ts";
import { answer } from "./lib/answers.ts";
import { findPeople, groups, havePolls } from "./lib/audience.ts";
import * as comments from "./lib/comments.ts";
import { db } from "./lib/db.ts";
import { admit, checkForm } from "./lib/guard.ts";
import { guestCookie, guestCookieDays, guestCookiePath } from "./lib/guest-cookie.ts";
import * as guests from "./lib/guests.ts";
import { limits, memberPattern } from "./lib/model.ts";
import { nameOf, people } from "./lib/people.ts";
import * as polls from "./lib/polls.ts";
import { publicOrigin } from "./lib/public-origin.ts";
import * as replies from "./lib/replies.ts";
import { repeatSeries } from "./lib/series.ts";
import * as tell from "./lib/tell.ts";
import { chestZone } from "./lib/zone.ts";

// Every mutation of Polls, by name. action(): members only, the member read
// from the Chest's assertion on each call (with all their groups:
// src/app.tsx); publicAction(): anyone on the public part. Each reads its
// input by its fields; the rules are in src/lib/ — who may do what is
// checked there, from `member`, never from the input — and refuse with a
// code the reader sees in their words. From an island:
// call("closeNow", { pollId }). The page refreshes after each (unless the
// island says otherwise).
//
// Texts are bounded loosely here and exactly in src/lib/ (which counts
// characters, not UTF-16 units, and says the right maximum).
const loose = (max: number) => field.text({ max: max * 2 });
const poll = { pollId: field.id() };

// The groups and the people a poll may ask: the Chest's groups (all of
// them with the groups proposal), and only members who have Polls.
async function known(): Promise<string[] | null> {
  return (await groups())?.map(g => g.id) ?? null;
}
async function knownPeople(input: unknown): Promise<string[] | null> {
  const audience = input && typeof input === "object" ? (input as { audience?: { people?: unknown } }).audience : undefined;
  const ids = Array.isArray(audience?.people) ? audience.people.filter((p): p is string => typeof p === "string" && memberPattern.test(p)).slice(0, limits.people) : [];
  return havePolls(ids);
}

// The guest link's full address, on the public host.
function guestUrl(request: Request, link: string): string {
  const origin = publicOrigin(request.headers);
  return origin ? `${origin}/p/${link}` : fail("unavailable");
}

export const actions = {
  // Finding people to ask, by the start of their name (the composer).
  searchPeople: action({ q: field.text({ min: 0, max: 100 }) }, async ({ q }, { member }) => {
    if (!(await polls.mayCreate(db(), member))) fail("forbidden");
    return findPeople(q);
  }),

  // Writing: a new poll or a draft saved, sent at once when asked (the bell
  // items go out right away, within the Chest's quota). The composer's
  // whole poll is read by src/lib/model.ts (readPoll).
  savePoll: action({ pollId: field.optional(field.id()), input: field.json() }, async ({ pollId, input }, { member }) => {
    const sql = db();
    const context = { zone: chestZone(), known: await known(), knownPeople: await knownPeople(input) };
    const saved = pollId === undefined ? await polls.createPoll(sql, member, input, context) : await polls.updateDraft(sql, member, pollId, input, context);
    if (saved.status === "open") await tell.runTellings(sql);
    return saved;
  }),
  editPoll: action({ ...poll, input: field.json() }, async ({ pollId, input }, { member }) => ({ id: (await polls.editOpen(db(), member, pollId, input, { zone: chestZone() })).id })),
  sendPoll: action(poll, async ({ pollId }, { member }) => {
    const sql = db();
    await polls.sendDraft(sql, member, pollId, { zone: chestZone() });
    await tell.runTellings(sql);
  }),

  // Answering: the "asks you" item leaves the member's bell.
  answerPoll: action({ ...poll, answer: field.json() }, async ({ pollId, answer: given }, { member }) => {
    const sql = db();
    const done = await answer(sql, member, pollId, given);
    await tell.answered(sql, member, done.poll.id);
    return { first: done.first };
  }),

  // Organising: close, reopen, delete, restore, remind, pick the date.
  closeNow: action(poll, async ({ pollId }, { member }) => {
    const sql = db();
    await polls.closePoll(sql, member, pollId);
    await tell.settle(sql);
  }),
  reopen: action(poll, async ({ pollId }, { member }) => {
    const sql = db();
    await tell.refreshAsked(sql, await polls.reopenPoll(sql, member, pollId));
  }),
  remove: action(poll, async ({ pollId }, { member }) => {
    const sql = db();
    const gone = await polls.deletePoll(sql, member, pollId);
    await tell.removed(sql, gone);
    if (gone.finalOption !== null) await syncFinal(sql, gone.id);
  }),
  restore: action(poll, async ({ pollId }, { member }) => {
    const sql = db();
    const back = await polls.restorePoll(sql, member, pollId);
    await tell.runTellings(sql);
    await tell.refreshAsked(sql, back);
    if (back.finalOption !== null) await syncFinal(sql, back.id);
  }),
  // Reminding those who have not answered (bell, and email where the Chest
  // sends it).
  nudgePoll: action(poll, async ({ pollId }, { member }) => {
    const sql = db();
    await polls.nudge(sql, member, pollId);
    await tell.runTellings(sql);
  }),
  // A pulse survey: no more rounds, or rounds again.
  repeatPoll: action({ ...poll, on: field.bool() }, async ({ pollId, on }, { member }) => {
    await repeatSeries(db(), member, pollId, on, chestZone());
  }),
  // The chosen date: told to everyone asked, put in each person's Chest
  // calendar (Proposal (studio): calendar), emailed to the guests who gave
  // an address (Proposal (studio): mail).
  pickFinal: action({ ...poll, optionId: field.optional(field.id()) }, async ({ pollId, optionId }, { member, request }) => {
    const sql = db();
    const chosen = await polls.chooseFinal(sql, member, pollId, optionId ?? null);
    if (chosen.finalOption === null) await tell.unchosen(chosen.id);
    else await tell.runTellings(sql);
    await syncFinal(sql, chosen.id);
    if (chosen.finalOption !== null) await emailGuests(sql, chosen.id, publicOrigin(request.headers));
  }),

  // An admin: may every member start a poll, or organisers only? May
  // members start company surveys (repeating, eNPS) too?
  setPolicy: action({ which: field.choice(["create", "surveys"]), on: field.bool() }, async ({ which, on }, { member }) => {
    await polls.setPolicy(db(), member, which === "create" ? { membersCreate: on } : { membersSurveys: on });
  }),

  // Comments: posted (the organiser hears of it), deleted, brought back.
  postComment: action({ ...poll, body: loose(limits.comment) }, async ({ pollId, body }, { member }) => {
    const done = await comments.add(db(), member, pollId, body);
    await tell.commented(done.poll, member);
    return { id: done.comment.id };
  }),
  deleteComment: action({ commentId: field.id() }, async ({ commentId }, { member }) => {
    await comments.remove(db(), member, commentId);
  }),
  restoreComment: action({ commentId: field.id() }, async ({ commentId }, { member }) => {
    await comments.restore(db(), member, commentId);
  }),

  // Guests from outside the Chest on a date poll (src/lib/guests.ts): the
  // link turned on (a new one) or off; a guest's answer removed.
  setGuests: action({ ...poll, on: field.bool() }, async ({ pollId, on }, { member, request }) => {
    const link = await guests.setGuestLink(db(), member, pollId, on);
    return { link: link === null ? null : guestUrl(request, link) };
  }),
  removeGuest: action({ ...poll, participantId: field.id() }, async ({ pollId, participantId }, { member }) => {
    await guests.removeGuest(db(), member, pollId, participantId);
  }),

  // Replies to anonymous free texts (src/lib/replies.ts): those who manage
  // a closed anonymous survey reply under a text (everyone asked hears that
  // a reply was written, never to whom); the author reads and answers with
  // the keys their browser keeps.
  replyToText: action({ ...poll, at: field.int({ min: 0, max: 1_000_000 }), body: loose(limits.reply) }, async ({ pollId, at, body }, { member }) => {
    const done = await replies.reply(db(), member, pollId, at, body);
    await tell.replied(done.poll, member);
    return { id: done.reply.id };
  }),
  myReplies: action({ ...poll, keys: field.list(field.text({ max: 64 }), 20) }, async ({ pollId, keys }, { member, locale }) => {
    const found = await replies.mine(db(), member, pollId, keys);
    const who = await people(found.flatMap(c => c.replies.map(r => r.author)));
    return found.map(c => ({ ...c, replies: c.replies.map(r => ({ id: r.id, name: r.author === "anonymous" ? null : nameOf(who.get(r.author), locale), body: r.body })) }));
  }),
  answerBack: action({ ...poll, key: field.text({ max: 64 }), body: loose(limits.reply) }, async ({ pollId, key, body }, { member }) => {
    const done = await replies.answerBack(db(), member, pollId, key, body);
    await tell.answeredBack(done.poll);
    return { id: done.reply.id };
  }),

  // The guest page's one action (the public part): anyone on the Internet
  // may call it. It holds no member; it checks the form's guard first — a
  // field only robots fill (website), the signed "shown at" token, the
  // visitor counters —, then the answer against the poll the link opens
  // (src/lib/guests.ts). It reveals nothing but "received" or why not; the
  // guest's own answer is found again by the secret their browser keeps
  // (a cookie for that poll's page only; the database keeps its hash).
  answerGuest: publicAction({
    link: field.text({ max: 64 }),
    poll: field.optional(field.id()),
    started: field.text({ min: 0, max: 200 }),
    website: field.text({ min: 0, max: 200 }),
    name: field.text({ min: 0, max: limits.guestName * 2 }),
    email: field.text({ min: 0, max: limits.guestEmail * 2 }),
    dates: field.keyed(/^d([1-9][0-9]{0,17})$/u, field.int({ min: 0, max: 2 }), limits.dates.max),
  }, async (input, { locale, request, cookies }) => {
    if (input.website !== "") fail("invalid");
    await checkForm(input.started);
    const sql = db();
    await admit(sql, request.headers);
    // The secret of an earlier answer, if this browser keeps one for this
    // poll (its id picks the cookie; the secret is checked against the
    // poll the link opens).
    const secret = input.poll ? cookies.get(guestCookie(input.poll)) : undefined;
    const done = await guests.answerAsGuest(sql, input.link, { name: input.name, email: input.email, dates: input.dates, locale, secret }, new Date());
    cookies.set(guestCookie(done.poll.id), done.secret, { path: guestCookiePath(input.link), maxAge: guestCookieDays * 86_400 });
    redirect(`/p/${input.link}?sent=${done.first ? "1" : "2"}`);
  }),
};

