import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "./app-error.ts";
import { db } from "./db.ts";
import { exportZip } from "./export.ts";
import type { Catalogue, Locale } from "../i18n/index.ts";
import { id } from "./model.ts";
import { linkFile, linkGuard, myFile } from "./tickets.ts";

// The files the tool hands out — always as downloads, never shown in a
// page (they hold what customers sent: anything). The routes of
// src/app.tsx answer with these. A file is served with `nosniff`, no
// referrer and a sandbox policy (src/app.tsx keeps it on the answer).
const none = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });
const attachment = (name: string) => `attachment; filename="${name.replace(/[^\x20-\x7e]|["\\]/gu, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`;
export const filePolicy = "sandbox; default-src 'none'";

// A file of a customer's request, for whoever holds its follow-up link:
// theirs or the team's answers' (never a note's, never another request's).
// The bytes come through the tool — the Chest's signed links are for
// members' browsers on the team host — and a file is read whole (the SDK
// has no stream; 10 MiB at most). So at most two are held at once in the
// process (256 MiB a tool): a slot is taken before the file is read and
// given back once its last byte has left, or the download was cancelled,
// or after two minutes (a reader that stalls holds no slot for ever). The
// others are told to come back in a moment (503, Retry-After), and each
// link downloads so many an hour (tickets.linkGuard).
export const downloadLimits = { inFlight: 2, retryAfter: 5, seconds: 120, chunk: 64 << 10 } as const;
let inFlight = 0;
export async function publicFile(secret: string, fileId: string, head = false): Promise<Response> {
  const sql = db();
  const found = await linkFile(sql, secret, fileId);
  if (!found) return none(404);
  const headers = {
    "Content-Type": found.type,
    "Content-Disposition": attachment(found.fileName),
    "Content-Security-Policy": filePolicy,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "private, no-store",
  };
  // HEAD: what the file is, never its bytes — nothing read, no slot taken
  // (a body never sent would hold one).
  if (head) return new Response(null, { headers: { ...headers, "Content-Length": String(found.size) } });
  if (inFlight >= downloadLimits.inFlight) return new Response(null, { status: 503, headers: { "Retry-After": String(downloadLimits.retryAfter), "Cache-Control": "no-store" } });
  inFlight++;
  let held = true;
  let handed = false;
  const free = () => {
    if (held) inFlight--;
    held = false;
  };
  try {
    try {
      await linkGuard(sql, found.ticketId, "download");
    } catch (error) {
      if (error instanceof AppError) return new Response(null, { status: 429, headers: { "Retry-After": "3600", "Cache-Control": "no-store" } });
      throw error;
    }
    const object = await files.get(found.object);
    if (!object) return none(404);
    let data: Uint8Array | null = object.data;
    const size = data.byteLength;
    let at = 0;
    let deadline: NodeJS.Timeout | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        deadline = setTimeout(() => {
          data = null;
          free();
          controller.error(new Error("download too slow"));
        }, downloadLimits.seconds * 1000);
        deadline.unref();
      },
      pull(controller) {
        if (!data) return;
        if (at >= data.byteLength) {
          clearTimeout(deadline);
          data = null;
          free();
          controller.close();
          return;
        }
        controller.enqueue(data.slice(at, at + downloadLimits.chunk));
        at += downloadLimits.chunk;
      },
      cancel() {
        clearTimeout(deadline);
        data = null;
        free();
      },
    });
    const response = new Response(body, { headers: { ...headers, "Content-Length": String(size) } });
    // The body now holds the slot.
    handed = true;
    return response;
  } catch (error) {
    if (error instanceof ChestError) return none(503);
    throw error;
  } finally {
    if (!handed) free();
  }
}

// How many public downloads hold a slot now (tests).
export const downloadsInFlight = () => inFlight;

// A fresh 15-minute link the Chest signs (a download; a photo's thumbnail
// for the thread), or the Chest's refusal.
async function signed(object: string, options: { download: true } | { thumbnail: 256 }): Promise<Response> {
  try {
    const { url } = await files.url(object, options);
    return new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ChestError) return none(error.code === "not_found" ? 404 : 503);
    throw error;
  }
}

// An attachment of a ticket, for whoever reads tickets; ?thumbnail=1, a
// small image the Chest made of a photo.
export async function teamFile(actor: Member, fileId: string, thumbnail: boolean): Promise<Response> {
  if (!can(actor, "tickets.read")) return none(403);
  let key: string;
  try {
    key = id(fileId);
  } catch {
    return none(404);
  }
  const [row] = await db()<{ object: string; type: string }[]>`select object, type from attachments where id = ${key}`;
  if (!row) return none(404);
  return signed(row.object, thumbnail && /^image\/(jpeg|png|gif|webp)$/u.test(row.type) ? { thumbnail: 256 as const } : { download: true });
}

// The email as it was received (.eml), for whoever reads tickets: never
// shown in a page (it may hold anything its sender put in it).
export async function originalEmail(actor: Member, messageId: string): Promise<Response> {
  if (!can(actor, "tickets.read")) return none(403);
  let key: string;
  try {
    key = id(messageId);
  } catch {
    return none(404);
  }
  const [row] = await db()<{ original: string | null }[]>`select original from messages where id = ${key}`;
  if (!row?.original) return none(404);
  return signed(row.original, { download: true });
}

// A file of the member's own request (theirs, or one the team sent with an
// answer — never a note's). Anything else is 404.
export async function mineFile(actor: Member, number: string, fileId: string): Promise<Response> {
  const found = await myFile(db(), actor, number, fileId);
  return found ? signed(found.object, { download: true }) : none(404);
}

// A body read from a generator one piece per pull; a download cancelled
// midway stops the generator (and its queries).
function pulled(source: AsyncGenerator<Uint8Array>): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await source.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    async cancel() {
      await source.return(undefined);
    },
  });
}

// Every ticket and every message, as a streamed ZIP (lib/export.ts): two
// spreadsheets and one JSON file, headers in the reader's language.
export async function exportDownload(actor: Member, t: Catalogue, locale: Locale, today: string): Promise<Response> {
  try {
    const data = await exportZip(db(), actor, t, locale);
    // Sent as it is written: the body pulls the next piece when the
    // previous one has left (backpressure), so a slow download never piles
    // the archive up in memory.
    return new Response(pulled(data), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="support-export-${today}.zip"`, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return none(403);
    throw error;
  }
}
