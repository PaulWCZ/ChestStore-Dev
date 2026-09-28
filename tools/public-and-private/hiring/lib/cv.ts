import { randomBytes } from "node:crypto";
import { ChestError, TooLarge } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { AppError } from "./app-error.ts";
import type { Cv } from "./candidates.ts";
import { sign, verify } from "./signature.ts";
import { clean, cvTypes, isCvType, limits, sniff } from "./model.ts";

// CVs, in three steps around the browser's own upload to the Chest:
//
// 1. grant: the tool names the file (uploads/public/… for a visitor of the
//    careers page — Proposal (studio): public uploads —, uploads/team/… for
//    a recruiter) and asks the Chest for a one-time upload address; it
//    hands the browser that address and a ticket, the name signed by the
//    tool;
// 2. the browser sends the file to the Chest, never through the tool;
// 3. accept: with the application, the ticket comes back; the tool checks
//    the signature (a visitor can only claim a file the tool let them
//    send), then the file itself — there, of a CV's type, 10 MiB at most,
//    and its first bytes of that type — and moves it to cv/. A file that
//    fails is deleted. Files never claimed are deleted by the nightly
//    cleanup (sweep).
export type Kind = "public" | "team";
const ticketLife = 2 * 3600 * 1000;

export async function grant(kind: Kind, type: unknown, size: unknown, now = Date.now()): Promise<{ url: string; ticket: string; expiresIn: number }> {
  if (!isCvType(type)) throw new AppError("cv_invalid");
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) throw new AppError("cv_invalid");
  if (size > limits.cvSize) throw new AppError("cv_too_large");
  const hex = randomBytes(10).toString("hex");
  const extension = cvTypes[type];
  try {
    const up = await files.uploadUrl(`uploads/${kind}/${hex}.${extension}`, { ...(kind === "public" ? { public: true } : {}), types: [type], maxSize: limits.cvSize, expiresIn: 900 });
    const value = `${kind}.${hex}.${extension}.${now}`;
    return { url: up.url, ticket: `${value}.${sign("cv", value)}`, expiresIn: up.expiresIn };
  } catch (error) {
    if (error instanceof TooLarge) throw new AppError("cv_too_large");
    throw error;
  }
}

// readTicket gives the file a ticket names, or throws: signed by this tool,
// of the kind expected, not older than two hours.
export function readTicket(ticket: unknown, kind: Kind, now = Date.now()): { name: string; hex: string; extension: string } {
  if (typeof ticket !== "string" || ticket.length > 200) throw new AppError("cv_missing");
  const parts = ticket.split(".");
  if (parts.length !== 5) throw new AppError("cv_missing");
  const [k, hex, extension, time, signature] = parts as [string, string, string, string, string];
  if (k !== kind || !/^[0-9a-f]{20}$/u.test(hex) || !Object.values(cvTypes).includes(extension as never) || !/^\d{13}$/u.test(time)) throw new AppError("cv_missing");
  if (!verify("cv", `${k}.${hex}.${extension}.${time}`, signature)) throw new AppError("cv_missing");
  if (now - Number(time) > ticketLife || Number(time) - now > 60000) throw new AppError("cv_missing");
  return { name: `uploads/${kind}/${hex}.${extension}`, hex, extension };
}

const safeName = (value: unknown, extension: string): string => {
  let text = "";
  try {
    text = clean(value, limits.fileName, { optional: true });
  } catch {
    text = "";
  }
  text = text.replace(/[/\\]/gu, "_");
  return text || `cv.${extension}`;
};

// accept checks the file a ticket names and keeps it as a CV.
export async function accept(ticket: unknown, kind: Kind, fileName: unknown): Promise<Cv> {
  const { name, hex, extension } = readTicket(ticket, kind);
  try {
    const held = await files.stat(name);
    if (!held) throw new AppError("cv_missing");
    const refuse = async (code: "cv_invalid" | "cv_too_large") => {
      await files.delete(name).catch(() => false);
      return new AppError(code);
    };
    if (held.size > limits.cvSize) throw await refuse("cv_too_large");
    const declared = held.type.split(";")[0]!.trim().toLowerCase();
    if (!isCvType(declared) || cvTypes[declared] !== extension) throw await refuse("cv_invalid");
    const body = await files.get(name);
    if (!body || sniff(body.data.subarray(0, 16)) !== declared) throw await refuse("cv_invalid");
    const kept = `cv/${hex}.${extension}`;
    await files.move(name, kept);
    return { object: kept, fileName: safeName(fileName, extension), type: declared, size: held.size };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof ChestError) throw new AppError("unavailable");
    throw error;
  }
}

// remove deletes CV files from the Chest (erasure, a replaced CV, the
// retention): a file already gone is fine.
export async function remove(objects: Iterable<string>): Promise<void> {
  for (const object of objects) if (/^(cv|uploads\/(public|team))\/[0-9a-f]{20}\.(pdf|docx?)$/u.test(object)) await files.delete(object).catch(() => false);
}

// sweep deletes the uploads nobody claimed within a day: a visitor who
// sent a file then left the form, a refused application.
export async function sweep(now = new Date()): Promise<number> {
  let gone = 0;
  for (const prefix of ["uploads/public/", "uploads/team/"]) {
    let after: string | undefined;
    for (let page = 0; page < 20; page++) {
      const { files: list, next } = await files.list({ prefix, ...(after ? { after } : {}) });
      for (const f of list) {
        if (now.getTime() - new Date(f.updated).getTime() > 86400000) {
          if (await files.delete(f.name).catch(() => false)) gone++;
        }
      }
      if (!next) break;
      after = next;
    }
  }
  return gone;
}
