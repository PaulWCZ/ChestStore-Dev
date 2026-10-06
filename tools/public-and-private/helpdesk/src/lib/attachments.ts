import { randomBytes } from "node:crypto";
import { CapabilityNotGranted, ChestError, TooLarge } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import type { Sql } from "./db.ts";
import { check } from "./form-token.ts";
import { byLink, guard, myRequest, settings } from "./tickets.ts";
import { checkFile, fileName, fileTypes, isFileType, limits, type FileType } from "./model.ts";

// Files added to a message, around the browser's own upload to the Chest
// (the bytes never go through the tool):
//
// 1. grant: after the tool's own checks of who asks (a signed form, a
//    follow-up link, a member who answers), the Chest gives a one-time
//    upload address for one file of that type and size;
// 2. the browser sends the file there. A visitor's upload (Proposal
//    (studio): public uploads) answers a claim, never the object's name; a
//    member's upload answers its name, under uploads/team/;
// 3. take: with the message, the claims (or names) come back; the tool
//    trades each claim once (so a visitor can only attach what they sent
//    themselves), checks the file again and moves it to files/, where the
//    ticket keeps it. A visitor's upload nobody claims is deleted by the
//    Chest after a day; a member's, by the nightly cleanup (sweep).
export type Kind = "public" | "team";
export type Stored = { object: string; fileName: string; type: FileType; size: number };

const folder: Record<Kind, string> = { public: "uploads/public/", team: "uploads/team/" };
const teamName = /^uploads\/team\/[0-9a-f]{20}\.[a-z0-9]{1,8}$/u;
const claimPattern = /^[A-Za-z0-9_-]{16,128}\.claim$/u;

export async function grant(kind: Kind, type: unknown, size: unknown): Promise<{ url: string; expiresIn: number }> {
  const refused = checkFile(type, size);
  if (refused) throw new AppError(refused, { max: limits.fileSize >> 20 });
  try {
    const up = await files.uploadUrl(folder[kind], {
      types: [type as string],
      maxSize: limits.fileSize,
      expiresIn: 900,
      ...(kind === "public" ? { public: true, expiresUnclaimedAfter: 86400 } : {}),
    });
    return { url: up.url, expiresIn: up.expiresIn };
  } catch (error) {
    if (error instanceof TooLarge) throw new AppError("file_too_large", { max: limits.fileSize >> 20 });
    if (error instanceof ChestError) throw new AppError("files_unavailable");
    throw error;
  }
}

// visitorGrant: a visitor may send a file for the form they were shown
// (its signed token, the form open) or for their own request (its link),
// a few an hour — nothing else.
export async function visitorGrant(sql: Sql, where: { started?: unknown; secret?: unknown }, visitor: string, type: unknown, size: unknown): Promise<{ url: string; expiresIn: number }> {
  if (where.secret !== undefined) {
    if (!(await byLink(sql, where.secret))) throw new AppError("not_found");
  } else {
    check(where.started, Date.now(), { fast: true });
    if (!(await settings(sql)).formOpen) throw new AppError("closed_form");
  }
  await guard(sql, visitor, "file");
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

// What a form sends about its files: [{ref, name}] — ref is a claim (a
// visitor) or an object's name (a member); name is the file's own name.
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
  let held: { name: string; type: string; size: number } | null;
  if (kind === "public") {
    if (!claimPattern.test(ref)) throw new AppError("file_missing");
    held = await files.claim(ref);
    if (!held.name.startsWith(folder.public)) throw new AppError("file_missing");
  } else {
    if (!teamName.test(ref)) throw new AppError("file_missing");
    const info = await files.stat(ref);
    held = info ? { name: ref, type: info.type, size: info.size } : null;
    if (!held) throw new AppError("file_missing");
  }
  const type = held.type.split(";")[0]!.trim().toLowerCase();
  const refused = !isFileType(type) ? "file_type" : checkFile(type, held.size);
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

// sweep deletes the files members sent but never added to a message (a
// closed tab, a removed file), after a day. A visitor's are the Chest's.
export async function sweep(now = new Date()): Promise<number> {
  let gone = 0;
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const { files: list, next } = await files.list({ prefix: folder.team, ...(after ? { after } : {}) });
    for (const f of list) if (now.getTime() - new Date(f.updated).getTime() > 86400000 && (await files.delete(f.name).catch(() => false))) gone++;
    if (!next) break;
    after = next;
  }
  return gone;
}
