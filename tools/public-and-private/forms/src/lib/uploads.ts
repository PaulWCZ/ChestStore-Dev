import { randomBytes } from "node:crypto";
import { ChestError, TooLarge } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { AppError } from "./app-error.ts";
import type { FileRef, StoredFile } from "../shared/logic.ts";
import { fileTypes, limits, sniff, typesFor, type Definition, type Question } from "../shared/model.ts";
import { sign, verify } from "./signature.ts";

// Files a respondent attaches, in three steps around the browser's own
// upload to the Chest (the bytes never go through the tool):
//
// 1. grant: for a file question of a form taking answers, the tool asks
//    the Chest for a one-time upload address, for one file of a type the
//    question accepts, 10 MiB at most.
//    - public form (Proposal (studio): public uploads): the Chest names the
//      object under uploads/public/ and answers the visitor's browser a
//      *claim*, which only that browser holds; an object nobody claims is
//      deleted by the Chest after a day;
//    - team form: the tool names the object under uploads/team/ and hands
//      the member's browser a ticket, the name signed by the tool.
// 2. the browser sends the file, then keeps the claim or ticket with the
//    answer (FileRef.ref);
// 3. accept: with the answer, the tool trades the claim (files.claim) or
//    checks the ticket, then checks the file — of an accepted type, within
//    the size, its first bytes of that type (the Chest's own check for the
//    types it sniffs, chestSniffs) — and moves it to answers/<form>/.
//    A visitor can only attach what they sent themselves.
export type Kind = "public" | "team";
const ticketLife = 2 * 3600 * 1000;

export function fileQuestion(def: Definition, questionId: unknown): Question {
  const q = def.pages.flatMap(p => p.questions).find(x => x.id === questionId);
  if (!q || q.kind !== "file") throw new AppError("not_found");
  return q;
}

// checkUpload: a file the question takes (its kind, its size), said
// before anything is asked of the Chest or counted.
export function checkUpload(q: Question, type: unknown, size: unknown): string {
  if (typeof type !== "string" || !typesFor(q.accept ?? "any").includes(type)) throw new AppError("file_invalid");
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) throw new AppError("file_invalid");
  if (size > limits.fileSize) throw new AppError("file_too_large");
  return type;
}

export async function grant(kind: Kind, q: Question, given: unknown, size: unknown, now = Date.now()): Promise<{ url: string; ticket?: string }> {
  const type = checkUpload(q, given, size);
  try {
    if (kind === "public") {
      const up = await files.publicUploadUrl("uploads/public/", { types: [type], maxSize: limits.fileSize, expiresIn: 900, expiresUnclaimedAfter: 86400 });
      return { url: up.url };
    }
    const hex = randomBytes(10).toString("hex");
    const ext = fileTypes[type]!.ext;
    const up = await files.uploadUrl(`uploads/team/${hex}.${ext}`, { types: [type], maxSize: limits.fileSize, expiresIn: 900 });
    const value = `team.${hex}.${ext}.${now}`;
    return { url: up.url, ticket: `${value}.${sign("file", value)}` };
  } catch (error) {
    if (error instanceof TooLarge) throw new AppError("file_too_large");
    throw error;
  }
}

// readTicket gives the object a team ticket names, or throws: signed by
// this tool, not older than two hours.
export function readTicket(ticket: string, now = Date.now()): string {
  const parts = ticket.split(".");
  if (parts.length !== 5) throw new AppError("file_missing");
  const [k, hex, ext, time, signature] = parts as [string, string, string, string, string];
  if (k !== "team" || !/^[0-9a-f]{20}$/u.test(hex) || !Object.values(fileTypes).some(t => t.ext === ext) || !/^\d{13}$/u.test(time)) throw new AppError("file_missing");
  if (!verify("file", `${k}.${hex}.${ext}.${time}`, signature)) throw new AppError("file_missing");
  if (now - Number(time) > ticketLife || Number(time) - now > 60000) throw new AppError("file_missing");
  return `uploads/team/${hex}.${ext}`;
}

// accept takes the file a claim or ticket names for this question, checks
// it and keeps it under the form.
export async function accept(kind: Kind, formId: string, q: Question, ref: FileRef): Promise<StoredFile> {
  let name: string;
  try {
    if (kind === "public") {
      if (!ref.ref.endsWith(".claim")) throw new AppError("file_missing");
      name = (await files.claim(ref.ref)).name;
    } else {
      name = readTicket(ref.ref);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof ChestError && error.status === 404) throw new AppError("file_missing");
    if (error instanceof ChestError) throw new AppError("unavailable");
    throw error;
  }
  const refuse = async (code: "file_invalid" | "file_too_large") => {
    await files.delete(name).catch(() => false);
    return new AppError(code);
  };
  try {
    const held = await files.stat(name);
    if (!held) throw new AppError("file_missing");
    if (held.size > limits.fileSize) throw await refuse("file_too_large");
    const type = held.type.split(";")[0]!.trim().toLowerCase();
    if (!typesFor(q.accept ?? "any").includes(type)) throw await refuse("file_invalid");
    if (!chestSniffs.has(type) && !(await reading(async () => {
      const body = await files.get(name);
      return body !== null && sniff(body.data.subarray(0, 16), type);
    }))) throw await refuse("file_invalid");
    const kept = `answers/${formId}/${randomBytes(10).toString("hex")}.${fileTypes[type]!.ext}`;
    await files.move(name, kept);
    return { file: kept, name: safeName(ref.name, fileTypes[type]!.ext), type, size: held.size };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof ChestError) throw new AppError("unavailable");
    throw error;
  }
}

// The types whose first bytes the Chest checks itself at the upload
// (contract 0.4: JPEG, PNG, GIF, WebP, PDF — 400 type_mismatch): the type
// it recorded is the content's, nothing is read here. The others (Office,
// OpenDocument, text) are read here — the SDK reads a file whole, up to
// 10 MiB, so two at a time in this process, whatever the answers arriving
// together (SDK report: a files.get of a range would read 16 bytes).
const chestSniffs = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"]);
const readers = { busy: 0, waiting: [] as (() => void)[] };
export async function reading<T>(run: () => Promise<T>, most = 2): Promise<T> {
  while (readers.busy >= most) await new Promise<void>(go => readers.waiting.push(go));
  readers.busy++;
  try {
    return await run();
  } finally {
    readers.busy--;
    readers.waiting.shift()?.();
  }
}

function safeName(name: string, ext: string): string {
  const text = name.replace(/[/\\\p{Cc}]/gu, "_").trim().slice(0, limits.fileName);
  return text || `file.${ext}`;
}

const objectPattern = /^(answers\/[0-9]{1,18}|uploads\/(public|team))\/[0-9a-z]{1,40}\.[a-z]{2,5}$/u;

// remove deletes answer files from the Chest (a refused answer, an erased
// or expired one): a file already gone is fine.
export async function remove(objects: Iterable<string>): Promise<void> {
  for (const object of objects) if (objectPattern.test(object)) await files.delete(object).catch(() => false);
}

// sweep deletes team uploads nobody attached to an answer within a day
// (public ones the Chest deletes itself: expiresUnclaimedAfter).
export async function sweep(now = new Date()): Promise<number> {
  let gone = 0;
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const { files: list, next } = await files.list({ prefix: "uploads/team/", ...(after ? { after } : {}) });
    for (const f of list) if (now.getTime() - new Date(f.updated).getTime() > 86400000 && (await files.delete(f.name).catch(() => false))) gone++;
    if (!next) break;
    after = next;
  }
  return gone;
}

// link: a fresh signed link to an answer's file, for a member's browser.
export async function link(object: string, download = false): Promise<string> {
  if (!objectPattern.test(object)) throw new AppError("not_found");
  try {
    return (await files.url(object, download ? { download: true } : {})).url;
  } catch (error) {
    if (error instanceof ChestError && error.status === 404) throw new AppError("not_found");
    if (error instanceof ChestError) throw new AppError("unavailable");
    throw error;
  }
}
