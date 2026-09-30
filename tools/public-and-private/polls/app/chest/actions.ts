"use server";

import type { Member } from "@argentic/chest-sdk/member";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { emailGuests, syncFinal } from "../../lib/agenda.ts";
import { answer } from "../../lib/answers.ts";
import { findPeople, groups, havePolls } from "../../lib/audience.ts";
import * as comments from "../../lib/comments.ts";
import { db } from "../../lib/db.ts";
import { attempt, AppError, type Result } from "../../lib/errors.ts";
import * as guests from "../../lib/guests.ts";
import { memberPattern } from "../../lib/model.ts";
import { localeOf } from "@argentic/chest-sdk/member";
import { nameOf, people } from "../../lib/people.ts";
import * as polls from "../../lib/polls.ts";
import * as replies from "../../lib/replies.ts";
import { publicOrigin } from "../../lib/public-origin.ts";
import { repeatSeries } from "../../lib/series.ts";
import { currentMember } from "../../lib/session.ts";
import * as tell from "../../lib/tell.ts";
import { chestZone } from "../../lib/zone.ts";

// The server actions of the members' part. Each is an endpoint anyone can
// call: each reads the member from the Chest's assertion again; the
// services check their rights. They answer codes, never sentences, and
// refresh the pages of /chest.

async function act<T>(step: (actor: Member) => Promise<T>): Promise<Result<T>> {
  const result = await attempt(async () => {
    const actor = await currentMember();
    if (!actor) throw new AppError("forbidden");
    return step(actor);
  });
  revalidatePath("/chest", "layout");
  return result;
}

async function known(): Promise<string[] | null> {
  return (await groups())?.map(g => g.id) ?? null;
}

// The people a poll is to ask, by name: only members who have Polls.
async function knownPeople(input: unknown): Promise<string[] | null> {
  const audience = input && typeof input === "object" ? (input as { audience?: { people?: unknown } }).audience : undefined;
  const ids = Array.isArray(audience?.people) ? audience.people.filter((p): p is string => typeof p === "string" && memberPattern.test(p)).slice(0, 200) : [];
  return havePolls(ids);
}

// Finding people to ask, by the start of their name (the composer).
export async function searchPeople(q: string): Promise<Result<{ id: string; name: string }[]>> {
  return act(async actor => {
    if (!(await polls.mayCreate(db(), actor))) throw new AppError("forbidden");
    return findPeople(typeof q === "string" ? q : "");
  });
}

// Writing: a new poll or a draft saved, sent at once when asked (the bell
// items go out right away, within the Chest's quota).
export async function savePoll(pollId: string | null, input: unknown): Promise<Result<{ id: string; status: polls.Status }>> {
  return act(async actor => {
    const sql = db();
    const context = { zone: chestZone(), known: await known(), knownPeople: await knownPeople(input) };
    const saved = pollId === null ? await polls.createPoll(sql, actor, input, context) : await polls.updateDraft(sql, actor, pollId, input, context);
    if (saved.status === "open") await tell.runTellings(sql);
    return saved;
  });
}

export async function editPoll(pollId: string, input: unknown): Promise<Result<{ id: string }>> {
  return act(async actor => {
    const poll = await polls.editOpen(db(), actor, pollId, input, { zone: chestZone() });
    return { id: poll.id };
  });
}

export async function sendPoll(pollId: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    await polls.sendDraft(sql, actor, pollId, { zone: chestZone() });
    await tell.runTellings(sql);
    return null;
  });
}

// Answering: the "asks you" item leaves the member's bell.
export async function answerPoll(pollId: string, input: unknown): Promise<Result<{ first: boolean }>> {
  return act(async actor => {
    const sql = db();
    const done = await answer(sql, actor, pollId, input);
    await tell.answered(sql, actor, done.poll.id);
    return { first: done.first };
  });
}

// Organising: close, reopen, delete, restore, pick the date.
export async function closeNow(pollId: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    await polls.closePoll(sql, actor, pollId);
    await tell.settle(sql);
    return null;
  });
}

export async function reopen(pollId: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const poll = await polls.reopenPoll(sql, actor, pollId);
    await tell.refreshAsked(sql, poll);
    return null;
  });
}

export async function remove(pollId: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const poll = await polls.deletePoll(sql, actor, pollId);
    await tell.removed(sql, poll);
    if (poll.finalOption !== null) await syncFinal(sql, poll.id);
    return null;
  });
}

export async function restore(pollId: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const poll = await polls.restorePoll(sql, actor, pollId);
    await tell.runTellings(sql);
    await tell.refreshAsked(sql, poll);
    if (poll.finalOption !== null) await syncFinal(sql, poll.id);
    return null;
  });
}

// Reminding those who have not answered (bell, and email where the Chest
// sends it).
export async function nudgePoll(pollId: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    await polls.nudge(sql, actor, pollId);
    await tell.runTellings(sql);
    return null;
  });
}

// A pulse survey: no more rounds, or rounds again.
export async function repeatPoll(pollId: string, on: boolean): Promise<Result<null>> {
  return act(async actor => {
    await repeatSeries(db(), actor, pollId, on === true, chestZone());
    return null;
  });
}

// An admin: may every member start a poll, or organisers only? May members
// start company surveys (repeating, eNPS) too?
export async function setMembersCreate(on: boolean): Promise<Result<null>> {
  return act(async actor => {
    await polls.setPolicy(db(), actor, { membersCreate: on });
    return null;
  });
}
export async function setMembersSurveys(on: boolean): Promise<Result<null>> {
  return act(async actor => {
    await polls.setPolicy(db(), actor, { membersSurveys: on });
    return null;
  });
}

// Comments: posted (the organiser hears of it), deleted, brought back.
export async function postComment(pollId: string, body: string): Promise<Result<{ id: string }>> {
  return act(async actor => {
    const done = await comments.add(db(), actor, pollId, body);
    await tell.commented(done.poll, actor);
    return { id: done.comment.id };
  });
}

export async function deleteComment(commentId: string): Promise<Result<null>> {
  return act(async actor => {
    await comments.remove(db(), actor, commentId);
    return null;
  });
}

export async function restoreComment(commentId: string): Promise<Result<null>> {
  return act(async actor => {
    await comments.restore(db(), actor, commentId);
    return null;
  });
}

export async function pickFinal(pollId: string, optionId: string | null): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const poll = await polls.chooseFinal(sql, actor, pollId, optionId);
    if (poll.finalOption === null) await tell.unchosen(poll.id);
    else await tell.runTellings(sql);
    // Each person's Chest calendar (Proposal (studio): calendar), and the
    // guests who gave an email (Proposal (studio): mail).
    await syncFinal(sql, poll.id);
    if (poll.finalOption !== null) await emailGuests(sql, poll.id, publicOrigin(await headers()));
    return null;
  });
}

// Guests from outside the Chest on a date poll (lib/guests.ts): the link
// turned on (a new one) or off; a guest's answer removed.
export async function setGuests(pollId: string, on: boolean): Promise<Result<{ link: string | null }>> {
  return act(async actor => {
    const link = await guests.setGuestLink(db(), actor, pollId, on === true);
    return { link: link === null ? null : guestUrl(await headers(), link) };
  });
}

function guestUrl(h: Headers, link: string): string {
  const origin = publicOrigin(h);
  if (!origin) throw new AppError("unavailable");
  return `${origin}/p/${link}`;
}

export async function removeGuest(pollId: string, participantId: string): Promise<Result<null>> {
  return act(async actor => {
    await guests.removeGuest(db(), actor, pollId, participantId);
    return null;
  });
}

// Replies to anonymous free texts (lib/replies.ts): those who manage a
// closed anonymous survey reply under a text (everyone asked hears that a
// reply was written, never to whom); the author reads and answers with the
// keys their browser keeps.
export async function replyToText(pollId: string, at: number, body: string): Promise<Result<{ id: string }>> {
  return act(async actor => {
    const done = await replies.reply(db(), actor, pollId, at, body);
    await tell.replied(done.poll, actor);
    return { id: done.reply.id };
  });
}

export type MyConversation = { at: number; key: string; question: string; body: string; replies: { id: string; name: string | null; body: string }[] };

export async function myReplies(pollId: string, keys: string[]): Promise<Result<MyConversation[]>> {
  return act(async actor => {
    const found = await replies.mine(db(), actor, pollId, keys);
    const who = await people(found.flatMap(c => c.replies.map(r => r.author)));
    const locale = localeOf(actor.language);
    return found.map(c => ({ ...c, replies: c.replies.map(r => ({ id: r.id, name: r.author === "anonymous" ? null : nameOf(who.get(r.author), locale), body: r.body })) }));
  });
}

export async function answerBack(pollId: string, key: string, body: string): Promise<Result<{ id: string }>> {
  return act(async actor => {
    const done = await replies.answerBack(db(), actor, pollId, key, body);
    await tell.answeredBack(done.poll);
    return { id: done.reply.id };
  });
}
