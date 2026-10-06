import { ChestError, TooLarge } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import * as members from "@argentic/chest-sdk/members";
import { action, fail, type Field } from "@argentic/chest-app";
import { inAudience } from "./lib/access.ts";
import { syncEvent } from "./lib/agenda.ts";
import * as answering from "./lib/answering.ts";
import { everyone, tally } from "./lib/audience.ts";
import { db } from "./lib/db.ts";
import * as posts from "./lib/posts.ts";
import * as proposals from "./lib/proposals.ts";
import { removeObjects } from "./lib/storage.ts";
import * as tell from "./lib/tell.ts";
import { undoImport } from "./lib/transfer.ts";
import { chestZone } from "./lib/zone.ts";
import { fileName } from "./lib/input.ts";
import { coverTypes, limits, videoTypes } from "./shared/model.ts";

// Every mutation of News, by name, served at POST /chest/actions/<name>
// and called from an island with call("pinPost", { postId, pinned }). The
// member is read from the Chest's assertion on each call (with all their
// groups: src/app.tsx); who may do what is checked in src/lib/, from
// `member`, never from the input. The services read their input
// themselves and refuse it with their own code (an unknown post is
// "not_found", a text too long "too_long" with its maximum): the fields
// here only type what an island sends (as()), the core bounds the body.
const as = <T>(): Field<T> => ({ read: value => value as T });
const post = { postId: as<string>() };

// Files go from the browser to the Chest itself, in three steps around
// that upload: requestUpload authorises one into the uploads folder
// (publishers; anyone, for the picture of a proposal), the browser PUTs
// it, recordUpload records it once the Chest says it holds it. The file
// is its uploader's until they save the post (src/lib/posts.ts).
const roles = ["cover", "attachment", "image", "inline"] as const;
type Role = (typeof roles)[number];
const role: Field<Role> = { read: (value): Role => ((roles as readonly unknown[]).includes(value) ? value as Role : fail("invalid")) };
const folder = "uploads/";
const uploaded = /^uploads\/[0-9a-f]{20}(\.[a-z0-9]{1,8})?$/u;

// The Chest refused or could not answer about a file: said in the
// reader's words.
function fileRefusal(error: unknown): never {
  if (error instanceof TooLarge) fail("file_too_large");
  if (error instanceof ChestError) fail("unavailable");
  throw error;
}

export const actions = {
  // Publishing: a new post, or changes to one. What is due is told at once
  // (a welcome to the new colleague, an edited Important post to its new
  // audience); a new Important post goes out after its "Undo" seconds
  // (release, or the next pass); a scheduled one waits for its time.
  savePost: action({ postId: as<string | null>(), input: as<posts.PostInput>() }, async ({ postId, input }, { member }) => {
    const sql = db();
    const options = { zone: chestZone() };
    const given: posts.PostInput = input !== null && typeof input === "object" ? input : fail("invalid");
    const saved: posts.Saved = postId === null || postId === undefined ? await posts.createPost(sql, member, given, { ...options, hold: true }) : await posts.updatePost(sql, member, postId, given, options);
    await removeObjects(saved.removed);
    // No longer Important, or for another audience: its items go from
    // every bell (the next lines tell the new audience again).
    const changed = "importantChanged" in saved ? (saved as posts.Updated) : null;
    if (changed && (changed.importantChanged || (changed.important && changed.audienceChanged))) {
      await tell.settled(saved.id);
      await tell.refreshEveryone(sql);
    }
    if (changed?.reconfirm) await tell.refreshEveryone(sql);
    if (saved.published && saved.undoUntil === null && (saved.important || saved.kind === "welcome" || saved.kind === "shoutout")) await tell.announce(sql);
    if (saved.kind === "event" || changed?.wasEvent) await syncEvent(sql, saved.id);
    return { id: saved.id, published: saved.published, undoUntil: saved.undoUntil };
  }),

  // The "Undo" seconds of a new Important post are over: it goes out now
  // (the next pass would send it otherwise).
  release: action({}, async () => {
    await tell.announce(db());
    return null;
  }),

  // "Undo" within those seconds: nothing was sent, the post is taken back.
  recallPost: action(post, async ({ postId }, { member }) => {
    await posts.recall(db(), member, postId);
    return null;
  }),

  deletePost: action(post, async ({ postId }, { member }) => {
    const sql = db();
    const done = await posts.deletePost(sql, member, postId);
    if (done.important) {
      await tell.settled(postId);
      await tell.refreshEveryone(sql);
    }
    if (done.kind === "event") await syncEvent(sql, postId);
    return null;
  }),

  restorePost: action(post, async ({ postId }, { member }) => {
    const sql = db();
    const done = await posts.restorePost(sql, member, postId);
    if (done.important) await tell.refreshEveryone(sql);
    if (done.kind === "event") await syncEvent(sql, postId);
    return null;
  }),

  pinPost: action({ ...post, pinned: as<boolean>() }, async ({ postId, pinned }, { member }) => {
    await posts.setPinned(db(), member, postId, pinned === true);
    return null;
  }),

  // Taking part: reactions, comments and replies, "I have read it", coming
  // or not.
  react: action({ ...post, emoji: as<string>(), on: as<boolean>() }, async ({ postId, emoji, on }, { member }) => {
    await posts.react(db(), member, postId, emoji, on);
    return null;
  }),

  addComment: action({ ...post, body: as<string>(), parentId: as<string | null>() }, async ({ postId, body, parentId }, { member }) => {
    const done = await posts.addComment(db(), member, postId, body, parentId ?? null);
    await tell.commented(member, done);
    return done.comment;
  }),

  editComment: action({ commentId: as<string>(), body: as<string>() }, async ({ commentId, body }, { member }) => {
    const sql = db();
    const done = await posts.editComment(sql, member, commentId, body);
    if (done.mentioned.length > 0) {
      const shown = await posts.post(sql, member, done.postId, { zone: chestZone() });
      await tell.mentionedIn(member, shown, done.mentioned, String(body), tell.postPath(shown.id) + "#comment-" + commentId);
    }
    return null;
  }),

  removeComment: action({ commentId: as<string>() }, async ({ commentId }, { member }) => {
    await posts.removeComment(db(), member, commentId);
    return null;
  }),

  restoreComment: action({ commentId: as<string>() }, async ({ commentId }, { member }) => {
    await posts.restoreComment(db(), member, commentId);
    return null;
  }),

  // People to mention in a comment: those who see the post, by the start of
  // their name (8 at most). It only reads: the page is not refreshed.
  mentionable: action({ ...post, query: as<string>() }, async ({ postId, query }, { member }) => {
    const shown = await posts.post(db(), member, postId, { zone: chestZone() });
    const q = typeof query === "string" ? query.trim().slice(0, 60) : "";
    if (!q) return [];
    try {
      const found = await members.list({ q, limit: 20 });
      return found.members
        .filter(m => m.id !== member.id && m.role !== null && (m.isAdmin || m.id === shown.author || inAudience(m, shown)))
        .slice(0, 8)
        .map(m => ({ id: m.id, name: m.name }));
    } catch (error) {
      if (error instanceof ChestError) return [];
      throw error;
    }
  }),

  confirmRead: action(post, async ({ postId }, { member }) => {
    const sql = db();
    const done = await posts.confirm(sql, member, postId);
    await tell.confirmed(sql, member, done.id);
    return null;
  }),

  // Coming or not: the calendar follows (Proposal (studio)); a seat freed
  // goes to the first waiting, who is told.
  answerEvent: action({ ...post, answer: as<"yes" | "no" | null>() }, async ({ postId, answer }, { member }): Promise<{ answer: "yes" | "no" | "wait" | null }> => {
    const value: "yes" | "no" | null = answer === "yes" || answer === "no" ? answer : answer === null || answer === undefined ? null : fail("invalid");
    return { answer: (await answering.answerEvent(db(), member, String(postId), value)).answer };
  }),

  // A reminder to those who have not confirmed an Important post (once a
  // day): a notification (the Chest emails it to those who chose so).
  remind: action(post, async ({ postId }, { member }) => {
    const sql = db();
    const reminded = await posts.claimReminder(sql, member, postId);
    const { confirmed } = await posts.confirmations(sql, member, postId);
    const { pending } = tally(reminded, confirmed, (await everyone()).people);
    await tell.remind(reminded, pending);
    return { count: pending.length };
  }),

  // An import from Slack taken back (src/lib/transfer.ts). The import
  // itself is POST /chest/transfer/import (a ZIP, src/app.tsx).
  undoSlackImport: action({ batch: as<string>() }, async ({ batch }, { member }) => ({ count: await undoImport(db(), member, batch) })),

  // Posts from everyone (src/lib/proposals.ts): propose, take back (and
  // Undo); a publisher publishes or declines (and Undo). Who is told:
  // src/lib/tell.ts.
  proposePost: action({ input: as<proposals.ProposalInput>() }, async ({ input }, { member }) => {
    const sql = db();
    const given: proposals.ProposalInput = input !== null && typeof input === "object" ? input : fail("invalid");
    const made = await proposals.propose(sql, member, given);
    await tell.proposalsWaiting(sql);
    return made;
  }),

  approveProposal: action({ proposalId: as<string>() }, async ({ proposalId }, { member }) => {
    const sql = db();
    const done = await proposals.approve(sql, member, proposalId);
    await tell.proposalApproved(sql, done);
    return { postId: done.postId };
  }),

  declineProposal: action({ proposalId: as<string>(), reason: as<string | null>() }, async ({ proposalId, reason }, { member }) => {
    const sql = db();
    await tell.proposalDeclined(sql, await proposals.decline(sql, member, proposalId, reason ?? null));
    return null;
  }),

  restoreProposal: action({ proposalId: as<string>() }, async ({ proposalId }, { member }) => {
    const sql = db();
    const back = await proposals.restore(sql, member, proposalId);
    await tell.proposalRestored(sql, proposalId, back.author);
    return null;
  }),

  // Files, step 1: an address to upload one file to, on the Chest. Pictures
  // as the Chest makes thumbnails of them; a gallery also takes videos
  // (played as they are), up to the attachments' size.
  requestUpload: action({ role, size: as<number>() }, async ({ role: kind, size }, { member }) => {
    if (!posts.mayUpload(member, kind)) fail("forbidden");
    const picture = kind === "cover" || kind === "inline";
    const max = picture ? limits.coverSize : limits.attachmentSize;
    const types = picture ? [...coverTypes] : kind === "image" ? [...coverTypes, ...videoTypes] : null;
    if (typeof size === "number" && size > max) fail("file_too_large");
    try {
      const up = await files.uploadUrl(folder, { maxSize: max, expiresIn: 600, ...(types ? { types } : {}) });
      return { url: up.url };
    } catch (error) {
      return fileRefusal(error);
    }
  }),

  // Files, step 3: the upload recorded, once the Chest holds it — only an
  // object of the uploads folder, as the Chest named it.
  recordUpload: action({ role, name: as<string>(), fileName: as<string>() }, async ({ role: kind, name, fileName: given }, { member }) => {
    if (!posts.mayUpload(member, kind)) fail("forbidden");
    if (typeof name !== "string" || !uploaded.test(name)) fail("invalid");
    let held: Awaited<ReturnType<typeof files.stat>>;
    try {
      held = await files.stat(name);
    } catch (error) {
      return fileRefusal(error);
    }
    if (!held) fail("file_missing");
    return posts.recordUpload(db(), member, { object: held!.name, fileName: fileName(given), type: held!.type, size: held!.size, role: kind });
  }),
};
