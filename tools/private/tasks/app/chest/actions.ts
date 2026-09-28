"use server";

import { revalidatePath } from "next/cache";
import * as boards from "../../lib/boards.ts";
import * as cards from "../../lib/cards.ts";
import { db } from "../../lib/db.ts";
import { attempt, AppError, type Result } from "../../lib/errors.ts";
import { catalogue, isLocale } from "../../lib/i18n/index.ts";
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
  return result;
}

// Boards.
export async function createBoard(input: { name: string; template: string; visibility: string; color?: string }): Promise<Result<{ id: string }>> {
  return act(async actor => {
    const t = catalogue(isLocale(actor.locale) ? actor.locale : "en");
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

export async function moveColumn(columnId: string, after: string | null, before: string | null): Promise<Result<null>> {
  return act(async actor => { await boards.moveColumn(db(), actor, columnId, after, before); return null; });
}

export async function archiveColumn(columnId: string, archived: boolean): Promise<Result<null>> {
  return act(async actor => { await boards.archiveColumn(db(), actor, columnId, archived); return null; });
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

export async function updateCard(cardId: string, input: { title?: string; description?: string; due?: string | null }): Promise<Result<null>> {
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

export async function moveCard(cardId: string, columnId: string, after: string | null, before: string | null): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const moved = await cards.moveCard(sql, actor, cardId, columnId, after, before);
    if (moved.completed !== null) {
      const detail = await cards.cardDetail(sql, actor, cardId);
      if (moved.completed) await tell.settled(cardId);
      await tell.refreshBadges(sql, detail.assignees);
    }
    return null;
  });
}

export async function setAssignees(cardId: string, people: string[]): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const change = await cards.setAssignees(sql, actor, cardId, people);
    await tell.assigned(actor, change.added, { id: cardId, title: change.title, boardId: change.boardId });
    await tell.unassigned(change.removed, cardId);
    await tell.refreshBadges(sql, [...change.added, ...change.removed]);
    return null;
  });
}

export async function setLabel(cardId: string, labelId: string, on: boolean): Promise<Result<null>> {
  return act(async actor => { await cards.setLabel(db(), actor, cardId, labelId, on); return null; });
}

export async function addItem(cardId: string, text: string): Promise<Result<cards.CheckItem>> {
  return act(actor => cards.addItem(db(), actor, cardId, text));
}

export async function updateItem(itemId: string, input: { text?: string; done?: boolean }): Promise<Result<null>> {
  return act(async actor => { await cards.updateItem(db(), actor, itemId, input); return null; });
}

export async function removeItem(itemId: string): Promise<Result<null>> {
  return act(async actor => { await cards.removeItem(db(), actor, itemId); return null; });
}

export async function addComment(cardId: string, body: string, mentions: string[]): Promise<Result<cards.Comment>> {
  return act(async actor => {
    const done = await cards.addComment(db(), actor, cardId, body, mentions);
    const card = { id: cardId, title: done.title, boardId: done.boardId };
    await tell.mentioned(actor, done.mentions, card, done.comment.body);
    await tell.commented(actor, done.assignees.filter(a => !done.mentions.includes(a)), card, done.comment.body);
    return done.comment;
  });
}

export async function editComment(commentId: string, body: string): Promise<Result<null>> {
  return act(async actor => { await cards.editComment(db(), actor, commentId, body); return null; });
}

export async function removeComment(commentId: string): Promise<Result<null>> {
  return act(async actor => { await cards.removeComment(db(), actor, commentId); return null; });
}

export async function archiveCard(cardId: string, archived: boolean): Promise<Result<null>> {
  return act(async actor => {
    const sql = db();
    const done = await cards.archiveCard(sql, actor, cardId, archived);
    if (archived) await tell.settled(cardId);
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

// Import: the page read the file to show what will come; the server reads
// it again (never trusting the page's reading) and writes the board.
export async function importBoard(kind: "trello" | "csv", text: string, name: string): Promise<Result<{ id: string; cards: number; matched: number; people: number }>> {
  return act(async actor => {
    const { fromCsv, fromTrello, importBoard: write } = await import("../../lib/importers.ts");
    if (typeof text !== "string" || text.length > 10 << 20) throw new AppError("import_invalid");
    const board = kind === "trello" ? fromTrello(text) : fromCsv(text, name);
    if (kind === "trello" && typeof name === "string" && name.trim()) board.name = name.trim().slice(0, 80);
    const t = catalogue(isLocale(actor.locale) ? actor.locale : "en");
    return write(db(), actor, board, t.templates.columns.done);
  });
}
