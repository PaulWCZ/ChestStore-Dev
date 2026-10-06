import { randomBytes } from "node:crypto";
import { ChestError, TooLarge } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { AppError } from "../shared/app-error.ts";
import type { Cv } from "./candidates.ts";
import { sign, verify } from "./signature.ts";
import { clean, cvTypes, isCvType, limits, type CvType } from "../shared/model.ts";
import { db, type Query } from "./db.ts";

// CVs, in three steps around the browser's own upload to the Chest:
//
// 1. grant: the tool asks the Chest for a one-time upload address, for one
//    file of a CV's type and size —
//    - a recruiter's (team): the tool names the file (uploads/team/…) and
//      hands the browser the address and a ticket, the name signed by the
//      tool;
//    - a visitor's of the careers page (public: Proposal (studio),
//      files.publicUploadUrl): a path on the host the page is on — the
//      public host, or the company's own domain once connected —, whose
//      answer to the browser is a claim, never the object's name;
// 2. the browser sends the file to the Chest, never through the tool;
// 3. accept (a ticket) or take (a claim): with the application, the ticket
//    or the claim comes back; the tool checks the signature, or trades the
//    claim once (a visitor can only attach what they sent themselves),
//    then what the Chest says of the file — of a CV's type, 10 MiB at
//    most — and moves it to cv/. Its first bytes were checked by the
//    Chest when it took the upload (an address names its types; a file
//    whose first bytes are not of its type is refused, type_mismatch): the
//    tool never reads a CV to accept it, so a burst of applications costs
//    no memory. A file that fails is deleted. A visitor's upload nobody claims is deleted by the Chest
//    after a day (expiresUnclaimedAfter); a recruiter's, by the nightly
//    cleanup (sweep).
// A ticket names a recruiter's upload (team); a visitor's is a claim.
export type Kind = "team";
const ticketLife = 2 * 3600 * 1000;

// A CV's type and size as the browser says them, checked before the Chest
// is asked anything.
function checked(type: unknown, size: unknown): CvType {
  if (!isCvType(type)) throw new AppError("cv_invalid");
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size <= 0) throw new AppError("cv_invalid");
  if (size > limits.cvSize) throw new AppError("cv_too_large");
  return type;
}

// grant: a recruiter's upload (team host), with its signed ticket.
export async function grant(kind: "team", type: unknown, size: unknown, now = Date.now()): Promise<{ url: string; ticket: string; expiresIn: number }> {
  const cvType = checked(type, size);
  const hex = randomBytes(10).toString("hex");
  const extension = cvTypes[cvType];
  try {
    const up = await files.uploadUrl(`uploads/${kind}/${hex}.${extension}`, { types: [cvType], maxSize: limits.cvSize, expiresIn: 900 });
    const value = `${kind}.${hex}.${extension}.${now}`;
    return { url: up.url, ticket: `${value}.${sign("cv", value)}`, expiresIn: up.expiresIn };
  } catch (error) {
    if (error instanceof TooLarge) throw new AppError("cv_too_large");
    throw error;
  }
}

// publicGrant: a visitor's upload (Proposal (studio): files.publicUploadUrl)
// — a path of the host the page is on, for one CV; unclaimed, the Chest
// deletes it after a day. A Chest without public uploads throws
// CapabilityNotGranted: the form then asks for a link instead (cv_off).
export async function publicGrant(type: unknown, size: unknown): Promise<{ url: string; expiresIn: number }> {
  const cvType = checked(type, size);
  try {
    const up = await files.publicUploadUrl("uploads/public/", { types: [cvType], maxSize: limits.cvSize, expiresIn: 900, expiresUnclaimedAfter: 86400 });
    return { url: up.url, expiresIn: up.expiresIn };
  } catch (error) {
    if (error instanceof TooLarge) throw new AppError("cv_too_large");
    throw error;
  }
}

// What a visitor's form sends for their CV: the claim their browser got.
export const claimPattern = /^[A-Za-z0-9_-]{16,128}\.claim$/u;

// take trades a visitor's claim for their file, once, and keeps it as a
// CV (cv/…), checked like a recruiter's. Anything else is cv_missing.
export async function take(claim: unknown, fileName: unknown): Promise<Cv> {
  if (typeof claim !== "string" || !claimPattern.test(claim)) throw new AppError("cv_missing");
  try {
    let held: files.FileObject;
    try {
      held = await files.claim(claim);
    } catch (error) {
      if (error instanceof ChestError && error.code === "not_found") throw new AppError("cv_missing");
      throw error;
    }
    if (!held.name.startsWith("uploads/public/")) throw new AppError("cv_missing");
    return await keep(held.name, held.type, held.size, fileName, "cv");
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof ChestError) throw new AppError("unavailable");
    throw error;
  }
}

// keep checks a file the Chest holds (its type and size, as the Chest
// says them: it checked the first bytes at upload) and moves it to the
// folder; refused, it is deleted.
async function keep(name: string, type: string, size: number, fileName: unknown, folder: Folder): Promise<Cv> {
  const refuse = async (code: "cv_invalid" | "cv_too_large") => {
    await files.delete(name).catch(() => false);
    return new AppError(code);
  };
  if (size > limits.cvSize) throw await refuse("cv_too_large");
  const declared = type.split(";")[0]!.trim().toLowerCase();
  if (!isCvType(declared)) throw await refuse("cv_invalid");
  const extension = cvTypes[declared];
  const kept = `${folder}/${randomBytes(10).toString("hex")}.${extension}`;
  await files.move(name, kept);
  return { object: kept, fileName: safeName(fileName, extension), type: declared, size };
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

// accept checks the file a ticket names and keeps it as a CV — or, for a
// file a recruiter sends with an email or keeps with a template (the same
// kinds of file: PDF, Word, a picture), in sent/ or templates/.
export type Folder = "cv" | "sent" | "templates";
export async function accept(ticket: unknown, kind: Kind, fileName: unknown, folder: Folder = "cv"): Promise<Cv> {
  const { name, extension } = readTicket(ticket, kind);
  try {
    const held = await files.stat(name);
    if (!held) throw new AppError("cv_missing");
    const declared = held.type.split(";")[0]!.trim().toLowerCase();
    if (!isCvType(declared) || cvTypes[declared] !== extension) {
      await files.delete(name).catch(() => false);
      throw new AppError("cv_invalid");
    }
    return await keep(name, held.type, held.size, fileName, folder);
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof ChestError) throw new AppError("unavailable");
    throw error;
  }
}

// remove deletes the tool's files from the Chest (erasure, a replaced CV,
// the retention): CVs, the files received emails brought (mail/, stored
// by the Chest), the careers page's images (public/brand/). A file
// already gone is fine; one the Chest could not delete now is kept in
// files_gone and tried again by the nightly cleanup (removeLeft) — an
// erased CV never survives silently. Nothing else of the tool's files is
// ever deleted.
export const isOurs = (object: string): boolean =>
  /^(cv|sent|templates|uploads\/(public|team))\/[0-9a-f]{20}\.(pdf|docx?|jpg|png|heic)$/u.test(object)
  || /^public\/brand\/[0-9a-f]{20}\.(png|jpg|webp)$/u.test(object)
  || (/^mail\/[^\s]{1,400}$/u.test(object) && !object.includes(".."));

export async function remove(objects: Iterable<string>): Promise<void> {
  const left: string[] = [];
  for (const object of objects) {
    if (!isOurs(object)) continue;
    try {
      await files.delete(object);
    } catch {
      left.push(object);
    }
  }
  if (left.length > 0) {
    await db()`insert into files_gone (object) select unnest(${db().array(left)}::text[]) on conflict do nothing`;
  }
}

// removeLeft tries again the files the Chest could not delete; each gone
// (or already gone) leaves the list. Run by the nightly cleanup.
export async function removeLeft(sql: Query, max = 500): Promise<{ removed: number; left: number }> {
  const rows = await sql<{ object: string }[]>`select object from files_gone order by since limit ${max}`;
  let removed = 0;
  for (const { object } of rows) {
    try {
      await files.delete(object);
      await sql`delete from files_gone where object = ${object}`;
      removed++;
    } catch {
      await sql`update files_gone set tries = tries + 1 where object = ${object}`;
    }
  }
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from files_gone`;
  return { removed, left: count?.n ?? 0 };
}

// copy gives a CV a second file (the same person considered for another
// job: each application keeps its own, erased with it) — or a template's
// file its own copy in an email (sent/: erased with the candidate).
export async function copy(object: string, folder: Folder = "cv"): Promise<Cv | null> {
  const m = /^(cv|templates)\/[0-9a-f]{20}\.(pdf|docx?|jpg|png|heic)$/u.exec(object);
  if (!m) return null;
  try {
    const body = await files.get(object);
    if (!body) return null;
    const kept = `${folder}/${randomBytes(10).toString("hex")}.${m[2]}`;
    await files.put(kept, body.data, body.type);
    return { object: kept, fileName: "", type: body.type.split(";")[0]!.trim(), size: body.data.byteLength };
  } catch (error) {
    if (error instanceof ChestError) throw new AppError("unavailable");
    throw error;
  }
}

// sweep deletes the uploads nobody kept within a day: a recruiter who
// sent a file then left the page. A visitor's unclaimed upload is the
// Chest's to delete (expiresUnclaimedAfter); one claimed and left (a
// refused application) is deleted here too.
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
