import { randomBytes } from "node:crypto";
import { CapabilityNotGranted, ChestError, TooLarge } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Sql } from "./db.ts";
import { byLink, linkGuard, myRequest, settings } from "./tickets.ts";
import { checkFile, fileName, fileTypes, isFileType, limits, type FileType } from "./model.ts";

// Files added to a message, around the browser's own upload to the Chest
// (the bytes never go through the tool):
//
// 1. grant: after the tool's own checks of who asks (a signed form, a
//    follow-up link, a member who answers), the Chest gives a one-time
//    upload address for one file of that type and size;
// 2. the browser sends the file there and is answered its name: the Chest
//    names it (20 hex characters and an extension), under uploads/public/
//    for a visitor (SDK 0.7.0: files.uploadUrl(folder, {public: true}),
//    on whichever address the page is), under uploads/team/ for a member;
// 3. take: with the message, the names come back; the tool checks each
//    is one of those folders' names, stats it, checks it again and moves
//    it to files/, where the ticket keeps it. The move is the trade: a
//    name taken once is gone from uploads/, so a second message naming it
//    gets file_missing (and the names are random: a visitor cannot guess
//    another's). What nobody took — a closed tab, a removed file — is
//    deleted by the nightly cleanup after a day (sweep): the Chest keeps
//    a visitor's upload until the tool deletes it.
export type Kind = "public" | "team";
export type Stored = { object: string; fileName: string; type: FileType; size: number };

const folder: Record<Kind, string> = { public: "uploads/public/", team: "uploads/team/" };
const uploaded: Record<Kind, RegExp> = {
  public: /^uploads\/public\/[0-9a-f]{20}\.[a-z0-9]{1,8}$/u,
  team: /^uploads\/team\/[0-9a-f]{20}\.[a-z0-9]{1,8}$/u,
};

// Whether this Chest takes visitors' files (the files capability granted), as its
// last answer said — kept ten minutes, nothing that must survive a sleep.
// A public page asks before it offers "Add files" (publicUploadsOn); a
// grant refused for that reason says so too.
let publicUploads: { on: boolean; at: number } | null = null;
const known = (now: number) => (publicUploads !== null && now - publicUploads.at < 600_000 ? publicUploads.on : null);

// publicUploadsOn asks the Chest once (an upload address for one byte that
// expires in a minute, never used: the SDK has no other way to ask), then
// answers from what it said. A Chest that does not answer: offered, as
// before (the upload itself then says it is not available).
export async function publicUploadsOn(now = Date.now()): Promise<boolean> {
  const said = known(now);
  if (said !== null) return said;
  try {
    await files.uploadUrl(folder.public, { public: true, types: ["image/png"], maxSize: 1, expiresIn: 60 });
    publicUploads = { on: true, at: now };
  } catch (error) {
    if (error instanceof CapabilityNotGranted) publicUploads = { on: false, at: now };
    else if (!(error instanceof ChestError)) throw error;
    else return true;
  }
  return publicUploads.on;
}

export async function grant(kind: Kind, type: unknown, size: unknown): Promise<{ url: string; expiresIn: number }> {
  const refused = checkFile(type, size, kind);
  if (refused) throw new AppError(refused, { max: limits.fileSize >> 20 });
  try {
    // A visitor's upload is a path on the page's own address (0.7.0); the
    // Chest recognises the type by the bytes, so a visitor may not send
    // plain text (checkFile).
    const options = { types: [type as string], maxSize: limits.fileSize, expiresIn: 900 };
    const up = kind === "public" ? await files.uploadUrl(folder.public, { ...options, public: true }) : await files.uploadUrl(folder.team, options);
    if (kind === "public") publicUploads = { on: true, at: Date.now() };
    return { url: up.url, expiresIn: up.expiresIn };
  } catch (error) {
    if (error instanceof TooLarge) throw new AppError("file_too_large", { max: limits.fileSize >> 20 });
    // A Chest that does not take visitors' files (the proposal not granted):
    // said plainly, and the public pages stop offering them.
    if (kind === "public" && error instanceof CapabilityNotGranted) {
      publicUploads = { on: false, at: Date.now() };
      throw new AppError("files_off");
    }
    if (error instanceof ChestError) throw new AppError("files_unavailable");
    throw error;
  }
}

// visitorGrant: a visitor may send a file for the form (open) — the
// package's bound proved a page of the tool was shown, and counts the
// visitor's files — or for their own request (its link, so many an hour
// per request: linkGuard). Nothing else.
export async function visitorGrant(sql: Sql, where: { secret?: string }, type: unknown, size: unknown): Promise<{ url: string; expiresIn: number }> {
  if (where.secret) {
    const ticket = await byLink(sql, where.secret);
    if (!ticket) throw new AppError("not_found");
    if (checkFile(type, size, "public") === null) await linkGuard(sql, ticket.id, "file");
  } else if (!(await settings(sql)).formOpen) throw new AppError("closed_form");
  return grant("public", type, size);
}

// memberGrant: someone who answers may send a file for a reply or a note.
export async function memberGrant(actor: Member | null, type: unknown, size: unknown): Promise<{ url: string; expiresIn: number }> {
  if (!can(actor, "tickets.answer")) throw new AppError("forbidden");
  return grant("team", type, size);
}

// requesterGrant: a colleague may send a file for their own request only
// (My requests); the request must be theirs.
export async function requesterGrant(sql: Sql, actor: Member | null, number: unknown, type: unknown, size: unknown): Promise<{ url: string; expiresIn: number }> {
  await myRequest(sql, actor, number);
  return grant("team", type, size);
}

// What a form sends about its files: [{ref, name}] — ref is the name the
// Chest gave the upload; name is the file's own name.
function refs(value: unknown): { ref: string; name: string }[] {
  if (value === undefined || value === null || value === "") return [];
  let list: unknown = value;
  if (typeof value === "string") {
    if (value.length > 20000) throw new AppError("invalid");
    try {
      list = JSON.parse(value);
    } catch {
      throw new AppError("invalid");
    }
  }
  if (!Array.isArray(list)) throw new AppError("invalid");
  if (list.length > limits.filesPerMessage) throw new AppError("too_many_files", { max: limits.filesPerMessage });
  return list.map(item => {
    const ref = (item as { ref?: unknown } | null)?.ref;
    if (typeof ref !== "string" || ref.length > 200) throw new AppError("invalid");
    return { ref, name: fileName((item as { name?: unknown }).name) };
  });
}

// take turns what the browser sent into files kept for the message, or
// throws — and then nothing stays: the files taken so far are deleted.
export async function take(kind: Kind, value: unknown): Promise<Stored[]> {
  const wanted = refs(value);
  if (new Set(wanted.map(w => w.ref)).size !== wanted.length) throw new AppError("invalid");
  const kept: Stored[] = [];
  try {
    for (const w of wanted) kept.push(await takeOne(kind, w.ref, w.name));
    return kept;
  } catch (error) {
    await remove(kept.map(k => k.object));
    if (error instanceof AppError) throw error;
    if (error instanceof CapabilityNotGranted) throw new AppError("files_unavailable");
    if (error instanceof ChestError) throw new AppError(error.code === "not_found" ? "file_missing" : "unavailable");
    throw error;
  }
}

async function takeOne(kind: Kind, ref: string, name: string): Promise<Stored> {
  if (!uploaded[kind].test(ref)) throw new AppError("file_missing");
  const info = await files.stat(ref);
  if (!info) throw new AppError("file_missing");
  const held = { name: ref, type: info.type, size: info.size };
  const type = held.type.split(";")[0]!.trim().toLowerCase();
  const refused = !isFileType(type) ? "file_type" : checkFile(type, held.size, kind);
  if (refused) {
    await files.delete(held.name).catch(() => false);
    throw new AppError(refused, { max: limits.fileSize >> 20 });
  }
  const object = `files/${randomBytes(10).toString("hex")}.${fileTypes[type as FileType]}`;
  await files.move(held.name, object);
  return { object, fileName: name, type: type as FileType, size: held.size };
}

// remove deletes files from the Chest (a message not saved, an erasure, the
// retention): a file already gone is fine.
export async function remove(objects: Iterable<string>): Promise<void> {
  for (const object of objects) await files.delete(object).catch(() => false);
}

// sweep deletes the files visitors and members sent but never added to a
// message (a closed tab, a removed file, a robot), after a day: a file
// taken was moved to files/, so whatever is still under uploads/ was never
// recorded. 0.7.0 keeps a visitor's upload until the tool deletes it (no
// expiry of its own), so this sweep is the only one.
export async function sweep(now = new Date()): Promise<number> {
  let gone = 0;
  for (const prefix of [folder.public, folder.team]) {
    let after: string | undefined;
    for (let page = 0; page < 20; page++) {
      const { files: list, next } = await files.list({ prefix, ...(after ? { after } : {}) });
      for (const f of list) if (now.getTime() - new Date(f.updated).getTime() > 86400000 && (await files.delete(f.name).catch(() => false))) gone++;
      if (!next) break;
      after = next;
    }
  }
  return gone;
}
