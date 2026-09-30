"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import * as boards from "../../lib/boards.ts";
import { tellLinkedTools } from "../../lib/card-events.ts";
import * as cards from "../../lib/cards.ts";
import { db } from "../../lib/db.ts";
import { attempt, AppError, type Result } from "../../lib/errors.ts";
import { localeOf } from "@argentic/chest-sdk/member";
import { catalogue } from "../../lib/i18n/index.ts";
import * as dueCalendar from "../../lib/due-calendar.ts";
import * as mail from "../../lib/mail.ts";
import * as reminders from "../../lib/reminders.ts";
import { currentMember } from "../../lib/session.ts";
import * as tell from "../../lib/tell.ts";

// The server actions of the members' part. Each is an endpoint anyone can
// call: each reads the member from the Chest's assertion again; the
// services check their rights. They answer codes, never sentences, and
// refresh the pages of /chest.

async function act<T>(step: (actor: NonNullable<Awaited<ReturnType<typeof currentMember>>>) => Promise<T>): Promise<Result<T>> {
  const result = await attempt(async () => {
    const actor = await currentMember();
    if (!actor) throw new AppError("forbidden");
    return step(actor);
  });
  revalidatePath("/chest", "layout");
  // Emails that waited long enough leave once the answer is sent; the
  // members' calendars follow what changed (due dates, people, done).
  after(() => mail.flushMail(db()).then(() => undefined, error => console.error("mail queue", error instanceof Error ? error.name : "error")));
  after(() => dueCalendar.sync(db()).then(() => undefined));
  // The tools linked to Tasks hear of the cards done or reopened
  // (lib/card-events.ts); what the Chest cannot take waits for the next.
  after(() => tellLinkedTools(db()));
  return result;
}

// Boards.
export async function createBoard(input: { name: string; template: string; visibility: string; color?: string; people?: string[]; groups?: string[] }): Promise<Result<{ id: string }>> {
  return act(async actor => {
    const t = catalogue(localeOf(actor.language));
    const b = await boards.createBoard(db(), actor, input, t.templates.columns);
    return { id: b.id };
  });
}

export async function updateBoard(boardId: string, input: { name?: string; color?: string; visibility?: string }): Promise<Result<null>> {
  return act(async actor => { await boards.updateBoard(db(), actor, boardId, input); return null; });
}

export async function setBoardPeople(boardId: string, input: { people: string[]; owners: string[]; groups: string[] }): Promise<Result<null>> {
  return act(async actor => { await boards.setPeople(db(), actor, boardId, input); return null; });
}

export async function archiveBoard(boardId: string, archived: boolean): Promise<Result<null>> {
  return act(async actor => { await boards.archiveBoard(db(), actor, boardId, archived); return null; });
}

export async function deleteBoard(boardId: string): Promise<Result<null>> {
  return act(async actor => { await boards.deleteBoard(db(), actor, boardId); return null; });
}

// Columns.
export async function addColumn(boardId: string, name: string): Promise<Result<boards.Column>> {
  return act(actor => boards.addColumn(db(), actor, boardId, name));
}

export async function updateColumn(columnId: string, input: { name?: string; done?: boolean }): Promise<Result<null>> {
  return act(async actor => { await boards.updateColumn(db(), actor, columnId, input); return null; });
}

export async function moveColumn(columnId: string, afterId: string | null, beforeId: string | null): Promise<Result<null>> {
  return act(async actor => { await boards.moveColumn(db(), actor, columnId, afterId, beforeId); return null; });
}

// Archive a column; its cards go with it, or first to another column (to).
export async function archiveColumn(columnId: string, archived: boolean, to?: string | null): Promise<Result<{ cards: number; moved: number }>> {
  return act(async actor => {
    const sql = db();
    const done = await boards.archiveColumn(sql, actor, columnId, archived, { to: to ?? null });
    return done;
  });
}

// Fields of a board.
export async function addField(boardId: string, input: { name: string; kind: string; options?: string[] }): Promise<Result<boards.Field>> {
  return act(actor => boards.addField(db(), actor, boardId, input));
}

export async function updateField(fieldId: string, input: { name?: string; options?: string[] }): Promise<Result<null>> {
  return act(async actor => { await boards.updateField(db(), actor, fieldId, input); return null; });
}

export async function removeField(fieldId: string): Promise<Result<null>> {
  return act(async actor => { await boards.removeField(db(), actor, fieldId); return null; });
}

// Labels.
export async function addLabel(boardId: string, input: { name: string; color: string }): Promise<Result<boards.Label>> {
  return act(actor => boards.addLabel(db(), actor, boardId, input));
}

export async function updateLabel(labelId: string, input: { name: string; color: string }): Promise<Result<null>> {
  return act(async actor => { await boards.updateLabel(db(), actor, labelId, input); return null; });
}

export async function removeLabel(labelId: string): Promise<Result<null>> {
  return act(async actor => { await boards.removeLabel(db(), actor, labelId); return null; });
}

// Cards.
export async function addCard(boardId: string, columnId: string, title: string, top = false): Promise<Result<cards.CardSummary>> {
  return act(actor => cards.addCard(db(), actor, boardId, columnId, title, { top }));
}

export async function updateCard(cardId: string, input: { title?: string; description?: string; due?: string | null; dueTime?: string | null; start?: string | null }): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const changed = await cards.updateCard(sql, actor, cardId, input);
    if (changed.dueChanged) {
      const detail = await cards.cardDetail(sql, actor, cardId);
      await tell.refreshBadges(sql, detail.assignees);
    }
    return null;
  });
}

export async function setValue(cardId: string, fieldId: string, value: string | null): Promise<Result<null>> {
  return act(async actor => { await cards.setValue(db(), actor, cardId, fieldId, value); return null; });
}

// Another board: move the card there, or copy it (there or here).
export async function moveToBoard(cardId: string, boardId: string, columnId: string): Promise<Result<{ boardId: string; dropped: number }>> {
  return act(async actor => {
    const sql = db();
    const moved = await cards.moveToBoard(sql, actor, cardId, boardId, columnId);
    if (moved.dropped.length > 0) await tell.unassigned(moved.dropped, cardId);
    if (moved.completed) await tell.settled(cardId, sql);
    await tell.refreshBadges(sql, [...moved.dropped, ...moved.stayed]);
    return { boardId: moved.to, dropped: moved.dropped.length };
  });
}

export async function duplicateCard(cardId: string, boardId: string, columnId: string): Promise<Result<{ id: string; boardId: string }>> {
  return act(async actor => {
    const sql = db();
    const copy = await cards.duplicateCard(sql, actor, cardId, boardId, columnId);
    await tell.refreshBadges(sql, copy.people);
    return { id: copy.id, boardId: copy.boardId };
  });
}

// Repeat: a rule of lib/repeat.ts, or null to stop.
export async function setRepeat(cardId: string, rule: unknown): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    await cards.setRepeat(sql, actor, cardId, rule);
    const detail = await cards.cardDetail(sql, actor, cardId);
    await tell.refreshBadges(sql, detail.assignees);
    return null;
  });
}

// The morning reminder's switch, for oneself.
export async function setReminder(on: boolean): Promise<Result<null>> {
  return act(async actor => { await reminders.setReminder(db(), actor, on); return null; });
}

// Email beside the bell, for oneself.
export async function setEmail(on: boolean): Promise<Result<null>> {
  return act(async actor => { await mail.setEmail(db(), actor, on); return null; });
}

// force: done although it waits for open cards (the person said so).
export async function moveCard(cardId: string, columnId: string, afterId: string | null, beforeId: string | null, force = false): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const moved = await cards.moveCard(sql, actor, cardId, columnId, afterId, beforeId, { force: force === true });
    if (moved.completed !== null) {
      const detail = await cards.cardDetail(sql, actor, cardId);
      if (moved.completed) {
        await tell.settled(cardId, sql);
        await tell.unblocked({ title: detail.title }, await cards.freed(sql, cardId));
      } else await tell.blockedAgain(await cards.waitingOn(sql, cardId));
      await tell.refreshBadges(sql, detail.assignees);
    }
    return null;
  });
}

// "Blocked by": this card waits for another of its board.
export async function addBlocker(cardId: string, blockerId: string): Promise<Result<null>> {
  return act(async actor => { await cards.addBlocker(db(), actor, cardId, blockerId); return null; });
}

export async function removeBlocker(cardId: string, blockerId: string): Promise<Result<null>> {
  return act(async actor => { await cards.removeBlocker(db(), actor, cardId, blockerId); return null; });
}

export async function setAssignees(cardId: string, people: string[]): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const change = await cards.setAssignees(sql, actor, cardId, people);
    await tell.assigned(actor, change.added, { id: cardId, title: change.title, boardId: change.boardId }, sql);
    await tell.unassigned(change.removed, cardId);
    await tell.refreshBadges(sql, [...change.added, ...change.removed]);
    return null;
  });
}

export async function setLabel(cardId: string, labelId: string, on: boolean): Promise<Result<null>> {
  return act(async actor => { await cards.setLabel(db(), actor, cardId, labelId, on); return null; });
}

export async function addItem(cardId: string, text: string, checklist?: string | null): Promise<Result<cards.CheckItem>> {
  return act(actor => cards.addItem(db(), actor, cardId, text, { checklist: checklist ?? null }));
}

// A step: ticked, renamed, given to someone (told), dated.
export async function updateItem(itemId: string, input: { text?: string; done?: boolean; assignee?: string | null; due?: string | null }): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const change = await cards.updateItem(sql, actor, itemId, input);
    if (change.assigned) await tell.stepAssigned(actor, change.assigned, { id: itemId, text: change.text }, change.card, sql);
    if (change.previous || input.done === true) await tell.stepSettled(change.card.id, itemId);
    await tell.refreshBadges(sql, [change.assigned, change.previous, change.assignee].filter((p): p is string => !!p));
    return null;
  });
}

export async function removeItem(itemId: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const gone = await cards.removeItem(sql, actor, itemId);
    await tell.stepSettled(gone.cardId, itemId);
    if (gone.assignee) await tell.refreshBadges(sql, [gone.assignee]);
    return null;
  });
}

export async function addChecklist(cardId: string, title: string): Promise<Result<cards.Checklist>> {
  return act(actor => cards.addChecklist(db(), actor, cardId, title));
}

export async function renameChecklist(checklistId: string, title: string): Promise<Result<null>> {
  return act(async actor => { await cards.renameChecklist(db(), actor, checklistId, title); return null; });
}

export async function removeChecklist(checklistId: string): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const gone = await cards.removeChecklist(sql, actor, checklistId);
    await tell.refreshBadges(sql, gone.assignees);
    return null;
  });
}

export async function addComment(cardId: string, body: string, mentions: string[]): Promise<Result<cards.Comment>> {
  return act(async actor => {
    const done = await cards.addComment(db(), actor, cardId, body, mentions);
    const card = { id: cardId, title: done.title, boardId: done.boardId };
    await tell.mentioned(actor, done.mentions, card, done.comment.body, db(), done.comment.id);
    await tell.commented(actor, done.assignees.filter(a => !done.mentions.includes(a)), card, done.comment.body, db(), done.comment.id);
    return done.comment;
  });
}

// A comment edited, deleted or brought back: what the bell shows of it
// follows (lib/tell.ts).
export async function editComment(commentId: string, body: string): Promise<Result<null>> {
  return act(async actor => { const sql = db(); await tell.commentShown(sql, await cards.editComment(sql, actor, commentId, body)); return null; });
}

export async function removeComment(commentId: string): Promise<Result<null>> {
  return act(async actor => { const sql = db(); await tell.commentGone(sql, await cards.removeComment(sql, actor, commentId)); return null; });
}

export async function restoreComment(commentId: string): Promise<Result<null>> {
  return act(async actor => { const sql = db(); await tell.commentShown(sql, await cards.restoreComment(sql, actor, commentId)); return null; });
}

export async function archiveCard(cardId: string, archived: boolean): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const done = await cards.archiveCard(sql, actor, cardId, archived);
    if (archived) await tell.settled(cardId, sql);
    await tell.refreshBadges(sql, done.assignees);
    return null;
  });
}

export async function deleteCard(cardId: string): Promise<Result<null>> {
  return act(async actor => {
    const { objects } = await cards.deleteCard(db(), actor, cardId);
    const files = await import("@argentic/chest-sdk/files");
    for (const object of objects) await files.delete(object).catch(() => false);
    return null;
  });
}

export async function detach(attachmentId: string): Promise<Result<null>> {
  return act(async actor => {
    const object = await cards.detach(db(), actor, attachmentId);
    const files = await import("@argentic/chest-sdk/files");
    await files.delete(object).catch(() => false);
    return null;
  });
}

// Import: the page read the file to show what will come, and asks which
// of the people named are found in the Chest; the server reads the file
// again (never trusting the page's reading) and writes the board, private
// unless "everyone" was chosen.
export async function previewImport(names: string[]): Promise<Result<{ found: string[]; missing: string[]; hidden: string[] }>> {
  return act(async actor => {
    const { previewPeople } = await import("../../lib/importers.ts");
    return previewPeople(actor, names);
  });
}

export async function importBoard(kind: "trello" | "csv", text: string, name: string, visibility: "team" | "private" = "private", done: number[] | null = null): Promise<Result<{ id: string; cards: number; matched: number; people: number }>> {
  return act(async actor => {
    const { fromCsv, fromTrello, importBoard: write } = await import("../../lib/importers.ts");
    if (typeof text !== "string" || text.length > 10 << 20) throw new AppError("import_invalid");
    const board = kind === "trello" ? fromTrello(text) : fromCsv(text, name);
    if (kind === "trello" && typeof name === "string" && name.trim()) board.name = name.trim().slice(0, 80);
    const t = catalogue(localeOf(actor.language));
    return write(db(), actor, board, t.templates.columns.done, { visibility, done });
  });
}
