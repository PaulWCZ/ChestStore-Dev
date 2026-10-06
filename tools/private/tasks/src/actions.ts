import { ChestError, TooLarge } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { action, after, fail, field, redirect, type Fields, type InputOf, type MemberContext } from "@argentic/chest-app";
import * as boards from "./lib/boards.ts";
import { tellLinkedTools } from "./lib/card-events.ts";
import * as cards from "./lib/cards.ts";
import { db } from "./lib/db.ts";
import * as dueCalendar from "./lib/due-calendar.ts";
import { importBoard, previewPeople } from "./lib/importers.ts";
import * as mail from "./lib/mail.ts";
import * as reminders from "./lib/reminders.ts";
import * as tell from "./lib/tell.ts";
import { colors, limits } from "./shared/model.ts";
import { fromCsv, fromTrello } from "./shared/parse-import.ts";
import { repeatKinds } from "./shared/repeat.ts";

// Every mutation of Tasks, by name: POST /chest/actions/<name>, called from
// the islands with call("moveCard", { id, column }). Each reads the member
// from the Chest's assertion; the services (src/lib/) check what the
// member may do and refuse with a code, never a sentence. The fields are
// lenient where the service has its own rule (its code and bound are the
// ones said: "Too long: 80 characters at most."), strict where a shape is
// all there is (an id, a choice).
//
// After each one, once answered: the emails that waited long enough leave
// (lib/mail.ts), the members' calendars follow what changed
// (lib/due-calendar.ts), and the tools linked to Tasks hear of the cards
// done or reopened (lib/card-events.ts); what the Chest cannot take waits
// for the next, or for the "mail" schedule.
function act<F extends Fields, R>(input: F, run: (input: InputOf<F>, context: MemberContext) => Promise<R>, options: { maxBody?: number } = {}) {
  return action(input, async (values, context) => {
    try {
      return await run(values, context);
    } finally {
      after("mail queue", () => mail.flushMail(db()));
      after("calendar sync", () => dueCalendar.sync(db()));
      after("linked tools", () => tellLinkedTools(db()));
    }
  }, options);
}

// Texts a service bounds itself: read as sent (twice its bound in UTF-16
// units, so the service's count of characters is the one that refuses).
const text = (max: number) => field.text({ min: 0, max: max * 2 });
const id = field.id;
const ids = (max: number) => field.list(field.text({ max: 40 }), max);
const day = () => field.nullable(field.day());
const color = () => field.choice(colors);

export const actions = {
  // ---- Boards. A new board opens at once.
  createBoard: act({ name: text(limits.boardName), template: field.choice(["simple", "project", "onboarding", "empty"]), visibility: field.choice(["team", "private"]), color: field.optional(color()), people: ids(limits.boardPeople), groups: ids(limits.boardPeople) },
    async (input, { member, t }) => {
      const made = await boards.createBoard(db(), member, input, t.templates.columns);
      redirect(`/chest/boards/${made.id}`);
    }),
  updateBoard: act({ id: id(), name: field.optional(text(limits.boardName)), color: field.optional(color()), visibility: field.optional(field.choice(["team", "private"])) },
    async ({ id, ...input }, { member }) => boards.updateBoard(db(), member, id, input)),
  setBoardPeople: act({ id: id(), people: ids(limits.boardPeople), owners: ids(limits.boardPeople), groups: ids(limits.boardPeople) },
    async ({ id, ...input }, { member }) => boards.setPeople(db(), member, id, input)),
  archiveBoard: act({ id: id(), archived: field.bool() }, async ({ id, archived }, { member }) => boards.archiveBoard(db(), member, id, archived)),
  deleteBoard: act({ id: id() }, async ({ id }, { member }) => boards.deleteBoard(db(), member, id)),

  // ---- Columns.
  addColumn: act({ board: id(), name: text(limits.columnName) }, async ({ board, name }, { member }) => boards.addColumn(db(), member, board, name)),
  updateColumn: act({ id: id(), name: field.optional(text(limits.columnName)), done: field.optional(field.bool()) },
    async ({ id, ...input }, { member }) => boards.updateColumn(db(), member, id, input)),
  moveColumn: act({ id: id(), after: field.optional(id()), before: field.optional(id()) },
    async ({ id, after, before }, { member }) => boards.moveColumn(db(), member, id, after ?? null, before ?? null)),
  // Archive a column; its cards go with it, or first to another column (to).
  archiveColumn: act({ id: id(), archived: field.bool(), to: field.optional(id()) },
    async ({ id, archived, to }, { member }) => boards.archiveColumn(db(), member, id, archived, { to: to ?? null })),

  // ---- Fields of a board (text, number, one choice).
  addField: act({ board: id(), name: text(limits.fieldName), kind: field.choice(["text", "number", "choice"]), options: field.optional(field.list(text(limits.fieldOption), limits.fieldOptions * 4)) },
    async ({ board, ...input }, { member }) => boards.addField(db(), member, board, input)),
  updateField: act({ id: id(), name: field.optional(text(limits.fieldName)), options: field.optional(field.list(text(limits.fieldOption), limits.fieldOptions * 4)) },
    async ({ id, ...input }, { member }) => boards.updateField(db(), member, id, input)),
  removeField: act({ id: id() }, async ({ id }, { member }) => boards.removeField(db(), member, id)),

  // ---- Labels.
  addLabel: act({ board: id(), name: text(limits.labelName), color: color() }, async ({ board, ...input }, { member }) => boards.addLabel(db(), member, board, input)),
  // A label made from a card's panel, put on the card at once.
  addCardLabel: act({ id: id(), name: text(limits.labelName), color: color() }, async ({ id, name, color }, { member }) => {
    const sql = db();
    const card = await cards.cardDetail(sql, member, id);
    const label = await boards.addLabel(sql, member, card.boardId, { name, color });
    await cards.setLabel(sql, member, id, label.id, true);
    return label;
  }),
  updateLabel: act({ id: id(), name: text(limits.labelName), color: color() }, async ({ id, ...input }, { member }) => boards.updateLabel(db(), member, id, input)),
  removeLabel: act({ id: id() }, async ({ id }, { member }) => boards.removeLabel(db(), member, id)),

  // ---- Cards.
  addCard: act({ board: id(), column: id(), title: text(limits.title), top: field.bool() },
    async ({ board, column, title, top }, { member }) => cards.addCard(db(), member, board, column, title, { top })),
  // A change of the card's words or dates: only what is sent changes; a
  // date sent empty (null) is taken off.
  updateCard: act({ id: id(), title: field.optional(text(limits.title)), description: field.sent(field.text({ min: 0, max: limits.description * 2 })), due: day(), dueTime: field.nullable(field.text({ max: 5 })), start: day() },
    async ({ id, ...input }, { member }) => {
      const sql = db();
      const changed = await cards.updateCard(sql, member, id, input);
      if (changed.dueChanged) await tell.refreshBadges(sql, (await cards.cardDetail(sql, member, id)).assignees);
    }),
  setValue: act({ id: id(), field: id(), value: field.nullable(text(limits.fieldValue)) },
    async ({ id, field, value }, { member }) => cards.setValue(db(), member, id, field, value ?? null)),
  // Another board: move the card there, or copy it (there or here).
  moveToBoard: act({ id: id(), board: id(), column: id() }, async ({ id, board, column }, { member }) => {
    const sql = db();
    const moved = await cards.moveToBoard(sql, member, id, board, column);
    if (moved.dropped.length > 0) await tell.unassigned(moved.dropped, id);
    if (moved.completed) await tell.settled(id, sql);
    await tell.refreshBadges(sql, [...moved.dropped, ...moved.stayed]);
    return { boardId: moved.to, dropped: moved.dropped.length };
  }),
  duplicateCard: act({ id: id(), board: id(), column: id() }, async ({ id, board, column }, { member }) => {
    const sql = db();
    const copy = await cards.duplicateCard(sql, member, id, board, column);
    await tell.refreshBadges(sql, copy.people);
    return { id: copy.id, boardId: copy.boardId };
  }),
  // Repeat: a rule of src/shared/repeat.ts (every day, weekday, week on
  // days, month on a day), or nothing to stop.
  setRepeat: act({ id: id(), every: field.optional(field.choice(repeatKinds)), days: field.list(field.int({ min: 0, max: 6 }), 7), day: field.optional(field.int({ min: 1, max: 31 })) },
    async ({ id, every, days, day }, { member }) => {
      const sql = db();
      const rule = every === undefined ? null : every === "week" ? { every, days } : every === "month" ? { every, day } : { every };
      await cards.setRepeat(sql, member, id, rule);
      await tell.refreshBadges(sql, (await cards.cardDetail(sql, member, id)).assignees);
    }),
  // force: done although it waits for open cards (the person said so).
  moveCard: act({ id: id(), column: id(), after: field.optional(id()), before: field.optional(id()), force: field.bool() },
    async ({ id, column, after, before, force }, { member }) => {
      const sql = db();
      const moved = await cards.moveCard(sql, member, id, column, after ?? null, before ?? null, { force });
      if (moved.completed !== null) {
        const detail = await cards.cardDetail(sql, member, id);
        if (moved.completed) {
          await tell.settled(id, sql);
          await tell.unblocked({ title: detail.title }, await cards.freed(sql, id));
        } else await tell.blockedAgain(await cards.waitingOn(sql, id));
        await tell.refreshBadges(sql, detail.assignees);
      }
    }),
  // "Blocked by": this card waits for another of its board.
  addBlocker: act({ id: id(), blocker: id() }, async ({ id, blocker }, { member }) => { await cards.addBlocker(db(), member, id, blocker); }),
  removeBlocker: act({ id: id(), blocker: id() }, async ({ id, blocker }, { member }) => cards.removeBlocker(db(), member, id, blocker)),
  setAssignees: act({ id: id(), people: ids(limits.assigneesPerCard * 2) }, async ({ id, people }, { member }) => {
    const sql = db();
    const change = await cards.setAssignees(sql, member, id, people);
    await tell.assigned(member, change.added, { id, title: change.title, boardId: change.boardId }, sql);
    await tell.unassigned(change.removed, id);
    await tell.refreshBadges(sql, [...change.added, ...change.removed]);
  }),
  setLabel: act({ id: id(), label: id(), on: field.bool() }, async ({ id, label, on }, { member }) => cards.setLabel(db(), member, id, label, on)),

  // ---- Checklists and their steps (subtasks).
  addItem: act({ id: id(), text: text(limits.checkItem), checklist: field.optional(id()) },
    async ({ id, text, checklist }, { member }) => cards.addItem(db(), member, id, text, { checklist: checklist ?? null })),
  // A step: ticked, renamed, given to someone (told), dated.
  updateItem: act({ id: id(), text: field.optional(text(limits.checkItem)), done: field.optional(field.bool()), assignee: field.nullable(field.text({ max: 40 })), due: day() },
    async ({ id, ...input }, { member }) => {
      const sql = db();
      const change = await cards.updateItem(sql, member, id, input);
      if (change.assigned) await tell.stepAssigned(member, change.assigned, { id, text: change.text }, change.card, sql);
      if (change.previous || input.done === true) await tell.stepSettled(change.card.id, id);
      await tell.refreshBadges(sql, [change.assigned, change.previous, change.assignee].filter((p): p is string => !!p));
    }),
  removeItem: act({ id: id() }, async ({ id }, { member }) => {
    const sql = db();
    const gone = await cards.removeItem(sql, member, id);
    await tell.stepSettled(gone.cardId, id);
    if (gone.assignee) await tell.refreshBadges(sql, [gone.assignee]);
  }),
  addChecklist: act({ id: id(), title: text(limits.checklistTitle) }, async ({ id, title }, { member }) => cards.addChecklist(db(), member, id, title)),
  renameChecklist: act({ id: id(), title: text(limits.checklistTitle) }, async ({ id, title }, { member }) => cards.renameChecklist(db(), member, id, title)),
  removeChecklist: act({ id: id() }, async ({ id }, { member }) => {
    const sql = db();
    const gone = await cards.removeChecklist(sql, member, id);
    await tell.refreshBadges(sql, gone.assignees);
  }),

  // ---- Comments. Edited, deleted or brought back: what the bell shows of
  // a comment follows (lib/tell.ts).
  addComment: act({ id: id(), body: field.text({ min: 0, max: limits.comment * 2 }), mentions: ids(40) }, async ({ id, body, mentions }, { member }) => {
    const sql = db();
    const done = await cards.addComment(sql, member, id, body, mentions);
    const card = { id, title: done.title, boardId: done.boardId };
    await tell.mentioned(member, done.mentions, card, done.comment.body, sql, done.comment.id);
    await tell.commented(member, done.assignees.filter(a => !done.mentions.includes(a)), card, done.comment.body, sql, done.comment.id);
    return done.comment;
  }),
  editComment: act({ id: id(), body: field.text({ min: 0, max: limits.comment * 2 }) }, async ({ id, body }, { member }) => {
    const sql = db();
    await tell.commentShown(sql, await cards.editComment(sql, member, id, body));
  }),
  removeComment: act({ id: id() }, async ({ id }, { member }) => {
    const sql = db();
    await tell.commentGone(sql, await cards.removeComment(sql, member, id));
  }),
  restoreComment: act({ id: id() }, async ({ id }, { member }) => {
    const sql = db();
    await tell.commentShown(sql, await cards.restoreComment(sql, member, id));
  }),

  // ---- Archive and delete.
  archiveCard: act({ id: id(), archived: field.bool() }, async ({ id, archived }, { member }) => {
    const sql = db();
    const done = await cards.archiveCard(sql, member, id, archived);
    if (archived) await tell.settled(id, sql);
    await tell.refreshBadges(sql, done.assignees);
  }),
  deleteCard: act({ id: id() }, async ({ id }, { member }) => {
    const { objects } = await cards.deleteCard(db(), member, id);
    for (const object of objects) await files.delete(object).catch(() => false);
  }),

  // ---- Files of a card, in three steps around the browser's own upload to
  // the Chest: uploadFile grants one into the card's folder (to someone who
  // works on the board), the browser PUTs the file there, recordFile keeps
  // it once the Chest says it holds it.
  uploadFile: act({ id: id(), size: field.int({ min: 0, max: Number.MAX_SAFE_INTEGER }) }, async ({ id, size }, { member }) => {
    const card = await writableCard(id, member);
    if (size > limits.attachmentSize) fail("file_too_large");
    try {
      const up = await files.uploadUrl(`cards/${card.id}/`, { maxSize: limits.attachmentSize, expiresIn: 600 });
      return { url: up.url };
    } catch (error) {
      if (error instanceof TooLarge) fail("file_too_large");
      throw error;
    }
  }),
  recordFile: act({ id: id(), name: field.text({ max: 200 }), fileName: text(limits.fileName) }, async ({ id, name, fileName }, { member }): Promise<cards.Attachment> => {
    const card = await writableCard(id, member);
    // Only an object of this card's folder, as the Chest named it.
    if (!name.startsWith(`cards/${card.id}/`) || !/^cards\/[0-9]+\/[0-9a-f]{20}(\.[a-z0-9]{1,8})?$/u.test(name)) fail("invalid");
    const held = await files.stat(name);
    if (!held) return fail("file_missing");
    return cards.attach(db(), member, card.id, { object: held.name, fileName, type: held.type, size: held.size });
  }),
  detach: act({ id: id() }, async ({ id }, { member }) => {
    const object = await cards.detach(db(), member, id);
    await files.delete(object).catch(() => false);
  }),

  // ---- Personal switches: the morning reminder, email beside the bell.
  setReminder: act({ on: field.bool() }, async ({ on }, { member }) => reminders.setReminder(db(), member, on)),
  setEmail: act({ on: field.bool() }, async ({ on }, { member }) => mail.setEmail(db(), member, on)),

  // ---- Import. The page read the files to show what will come, and asks
  // which of the people named are found in the Chest; the server reads
  // each file again (never trusting the page's reading) and writes the
  // board, private unless "everyone" was chosen. A file of 10 MB at most.
  previewImport: act({ names: field.list(field.text({ max: 200 }), 2000) }, async ({ names }, { member }) => previewPeople(member, names), { maxBody: 2 << 20 }),
  importBoard: act({ kind: field.choice(["trello", "csv"]), text: field.text({ max: 10 << 20 }), name: field.text({ min: 0, max: limits.boardName * 2 }), visibility: field.choice(["team", "private"]), done: field.list(field.int({ min: 0, max: 1000 }), 1000) },
    async ({ kind, text, name, visibility, done }, { member, t }): Promise<{ id: string; cards: number; matched: number; people: number }> => {
      const board = kind === "trello" ? fromTrello(text) : fromCsv(text, name);
      if (kind === "trello" && name) board.name = name.slice(0, limits.boardName);
      return importBoard(db(), member, board, t.templates.columns.done, { visibility, done });
    }, { maxBody: 11 << 20 }),
};

// A card the member may add files to: on a board they work on, not archived.
async function writableCard(cardId: string, member: MemberContext["member"]) {
  const card = await cards.cardDetail(db(), member, cardId);
  if ((card.access !== "write" && card.access !== "own") || card.archived) fail("forbidden");
  return card;
}
