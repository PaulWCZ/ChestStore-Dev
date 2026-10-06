import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import type { Member } from "@argentic/chest-sdk/member";
import { can } from "./access.ts";
import { AppError } from "../shared/app-error.ts";
import { cvOf } from "./candidates.ts";
import type { Sql } from "./db.ts";
import { fileOf } from "./messages.ts";
import { isPictureCv } from "../shared/model.ts";

// The files the team reads through the tool: a candidate's CV (named after
// the candidate's file, a PDF or a photo shown inside the candidate's page
// in a sandbox) and a file an email brought (always saved, never shown —
// it is the sender's, whatever it is). Only for who may see them: the
// rules check (cvOf: whoever sees the candidate; fileOf: a recruiter).
//
// The bytes come through the tool (the name and the sandbox are the
// tool's to give, a signed link of the Chest gives neither), and the SDK
// reads a file whole (10 MiB at most for a CV). So at most two are held
// at once in the process (256 MiB a tool): a slot is taken before the
// file is read and given back once its last byte has left, or the
// download was cancelled, or after two minutes (a reader that stalls
// holds no slot for ever). The others are told to come back in a moment
// (503, Retry-After). Links to them carry `download` (or are a frame's
// source): the browser fetches each once.
export const downloadLimits = { inFlight: 2, retryAfter: 5, seconds: 120, chunk: 64 << 10 } as const;
let inFlight = 0;
export const downloadsInFlight = () => inFlight;

const none = (status: number, extra: Record<string, string> = {}) => new Response(null, { status, headers: { "Cache-Control": "no-store", ...extra } });
const disposition = (kind: "inline" | "attachment", name: string) => `${kind}; filename="${name.replace(/[^\x20-\x7e]|["\\]/gu, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`;

// served sends one object of the Chest, holding a slot until it has left.
async function served(object: string, headers: Record<string, string>): Promise<Response> {
  if (inFlight >= downloadLimits.inFlight) return none(503, { "Retry-After": String(downloadLimits.retryAfter) });
  inFlight++;
  let held = true;
  let handed = false;
  const free = () => {
    if (held) inFlight--;
    held = false;
  };
  try {
    const found = await files.get(object);
    if (!found) return none(404);
    let data: Uint8Array | null = found.data;
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
    const response = new Response(body, { headers: { ...headers, "Content-Length": String(size), "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });
    handed = true;
    return response;
  } catch (error) {
    if (error instanceof ChestError) return none(error.code === "not_found" ? 404 : 503);
    throw error;
  } finally {
    if (!handed) free();
  }
}

// A candidate's CV: a PDF or a photo (JPEG, PNG) inline — framed by the
// tool's own pages only, in a sandbox —, ?download saves it; a Word or
// HEIC file is always saved.
export async function cvFile(sql: Sql, actor: Member, candidateId: string, download: boolean): Promise<Response> {
  let file: Awaited<ReturnType<typeof cvOf>>;
  try {
    file = await cvOf(sql, actor, candidateId);
  } catch (error) {
    if (error instanceof AppError) return none(404);
    throw error;
  }
  const shown = file.type === "application/pdf" || isPictureCv(file.type);
  const name = file.fileName || "cv." + (file.object.split(".").pop() ?? "pdf");
  return served(file.object, {
    "Content-Type": file.type,
    "Content-Disposition": disposition(shown && !download ? "inline" : "attachment", name),
    "Content-Security-Policy": "sandbox; default-src 'none'; frame-ancestors 'self'",
  });
}

// A file the team sent with an email, for a recruiter: always saved.
export async function messageFile(sql: Sql, actor: Member, messageId: string, which: string): Promise<Response> {
  if (!can(actor, "candidates.manage")) return none(403);
  let found: Awaited<ReturnType<typeof fileOf>>;
  try {
    found = await fileOf(sql, actor, messageId, which);
  } catch (error) {
    if (error instanceof AppError) return none(404);
    throw error;
  }
  return served(found.object, {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": disposition("attachment", found.name),
    "Content-Security-Policy": "sandbox; default-src 'none'",
  });
}

// A careers page's image, shown on the team's Settings: a fresh link the
// Chest signs on the team host (the public files are served on the
// public host only).
export async function brandImage(actor: Member, object: string, held: string[]): Promise<Response> {
  if (!can(actor, "settings") || !held.includes(object)) return none(404);
  try {
    const { url } = await files.url(object);
    return new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ChestError) return none(error.code === "not_found" ? 404 : 503);
    throw error;
  }
}
