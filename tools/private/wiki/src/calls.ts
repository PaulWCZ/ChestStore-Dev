import { ChestError } from "@argentic/chest-sdk/errors";
import * as events from "@argentic/chest-sdk/events";
import * as files from "@argentic/chest-sdk/files";
import type { Member } from "@argentic/chest-sdk/member";
import * as schedules from "@argentic/chest-sdk/schedules";
import { AppError, log } from "@argentic/chest-app";
import { catalogue, format, formatDate, localeOf } from "./i18n/index.ts";
import { can } from "./lib/access.ts";
import { db } from "./lib/db.ts";
import { leave } from "./lib/editing.ts";
import { attachment, exportZip, pageHtml, pageMarkdown } from "./lib/export.ts";
import { fileOf } from "./lib/files.ts";
import { importFiles } from "./lib/importer.ts";
import { handlers, seen } from "./lib/lifecycle.ts";
import { limits } from "./lib/model.ts";
import { origin } from "./lib/origin.ts";
import { page } from "./lib/pages.ts";
import { nameOf, people } from "./lib/people.ts";
import { csvCell, report } from "./lib/reads.ts";
import { reviews } from "./lib/tell.ts";

// What src/app.tsx answers outside the pages and the actions: the
// addresses the Chest calls by itself, the editor's beacon, the import's
// upload, the files and the downloads — plain functions of a Request (and
// the member the Chest asserted), so the tests call them as the server
// does.

// POST /chest-events: the members' lifecycle and the groups' changes
// ("receives"), signed by the Chest, at least once (a delivery already
// handled is dropped: `seen`). Never under /chest, never behind a session;
// the body is read by handle() only.
export async function chestEvents(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, { status: await events.handle(request, handlers(sql), { seen: seen(sql) }) });
}

// POST /chest-schedules: the runs of chest.json's "schedules", signed.
// "reviews", weekday mornings at 07:40 (the Chest's time zone): the pages
// due for a check tell their owners, the read requests a week old remind
// whoever has not confirmed. A run that fails comes again with the same
// id: it is idempotent (each reminder is marked told).
export async function chestSchedules(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, {
    status: await schedules.handle(request, {
      reviews: async run => {
        const done = await reviews(sql, run);
        log.info("reviews run", { told: done.told, reminded: done.reminded });
      },
    }, { seen: seen(sql) }),
  });
}

// A request the page itself sent: the browser says so (Sec-Fetch-Site),
// or, for an older one, its Origin is this host (the rule of the actions).
// A beacon sent while the tab closes carries the same headers.
export function sameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const from = request.headers.get("origin");
  try {
    return from !== null && new URL(from).host === request.headers.get("host");
  } catch {
    return false;
  }
}

const done = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

// POST /chest/api/pages/<id>/leave: the editor closing without "Save" or
// "Stop editing" — a closed tab, the back button, a link elsewhere. The
// browser sends it as a beacon (navigator.sendBeacon, text/plain so that
// no preflight is needed), with the latest draft when it is small enough.
// The page's lock is given back at once, the draft kept.
export async function leaveEditor(request: Request, actor: Member, pageId: string): Promise<Response> {
  if (!sameOrigin(request)) return done(403);
  try {
    const text = (await request.text()).slice(0, 2_100_000);
    let draft: { title: unknown; doc: unknown; baseVersion: unknown } | undefined;
    if (text) {
      try {
        const body = JSON.parse(text) as { title?: unknown; doc?: unknown; baseVersion?: unknown };
        if (body && typeof body === "object" && body.doc !== undefined) draft = { title: body.title, doc: body.doc, baseVersion: body.baseVersion };
      } catch {
        draft = undefined;
      }
    }
    await leave(db(), actor, pageId, draft);
    return done(204);
  } catch (error) {
    if (error instanceof AppError) return done(error.code === "not_found" ? 404 : 403);
    if (error instanceof ChestError) return done(503);
    throw error;
  }
}

// POST /chest/api/import: the import's files, sent by the page as a form,
// read in memory (the Chest gives no disk), bounded before they are read.
// Answers what was imported, or a code and its sentence.
export async function importUpload(request: Request, actor: Member): Promise<Response> {
  const t = catalogue(localeOf(actor.language));
  const answer = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const refuse = (error: keyof typeof t.errors, status: number, values?: Record<string, string | number>) => answer({ error, message: format(t.errors[error], values) }, status);
  if (!sameOrigin(request)) return refuse("forbidden", 403);
  if (!can(actor, "import")) return refuse("forbidden", 403);
  if (Number(request.headers.get("content-length") ?? "0") > limits.importBytes + (1 << 20)) return refuse("file_too_large", 413);
  try {
    const form = await request.formData();
    const sent = [];
    for (const entry of form.getAll("files")) {
      if (typeof entry === "string") continue;
      sent.push({ name: entry.name, data: new Uint8Array(await entry.arrayBuffer()) });
    }
    if (sent.length === 0) return refuse("import_empty", 400);
    const space = form.get("space");
    const name = form.get("name");
    const result = await importFiles(db(), actor, {
      ...(typeof space === "string" && space ? { spaceId: space } : { spaceName: typeof name === "string" && name.trim() ? name : t.importer.defaultName }),
      files: sent,
      words: { untitled: t.importer.untitled, attachments: t.importer.attachments },
    });
    log.info("import", { pages: result.pages, files: result.files });
    return answer(result);
  } catch (error) {
    if (error instanceof AppError) return refuse(error.code, error.code === "forbidden" ? 403 : error.code === "not_found" ? 404 : 400, error.values);
    if (error instanceof ChestError) return refuse("unavailable", 503);
    if (error instanceof TypeError) return refuse("import_invalid", 400);
    log.error("import failed", error);
    return refuse("unknown", 500);
  }
}

// GET /chest/files/<id>: an image or a file of a page, for whoever reads
// that page — a fresh 15-minute link signed by the Chest, never kept in a
// page. ?download to save it.
export async function openFile(request: Request, actor: Member, fileId: string): Promise<Response> {
  try {
    const f = await fileOf(db(), actor, fileId);
    const download = new URL(request.url).searchParams.has("download");
    const { url } = await files.url(f.object, { download });
    return new Response(null, { status: 303, headers: { Location: url, "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AppError) return done(404);
    if (error instanceof ChestError) return done(error.code === "not_found" ? 404 : 503);
    throw error;
  }
}

const download = (body: BodyInit, name: string, type: string) => new Response(body, { headers: { "Content-Type": type, "Content-Disposition": attachment(name), "Cache-Control": "no-store" } });

// GET /chest/pages/<id>/export?format=md|html|zip: a page to keep —
// Markdown, a web page of its own (images inside, ready to print), or a
// zip with the pages inside it.
export async function exportPage(request: Request, actor: Member, pageId: string): Promise<Response> {
  try {
    const locale = localeOf(actor.language);
    const t = catalogue(locale);
    const sql = db();
    const kind = new URL(request.url).searchParams.get("format");
    const base = origin(request);
    if (kind === "html") {
      const p = await page(sql, actor, pageId);
      const author = nameOf((await people([p.updatedBy])).get(p.updatedBy), locale);
      const meta = format(t.export.meta, { date: formatDate(new Date(), locale, { dateStyle: "long", timeZone: actor.timeZone }), version: p.version, name: author });
      const out = await pageHtml(sql, actor, pageId, base, { missing: t.page.missing, lang: locale, meta });
      return download(out.html, out.name, "text/html; charset=utf-8");
    }
    if (kind === "zip") {
      const out = await exportZip(sql, actor, { pageId }, base, { missing: t.page.missing });
      return download(out.data, out.name, "application/zip");
    }
    const out = await pageMarkdown(sql, actor, pageId, base, { missing: t.page.missing });
    return download(out.text, out.name, "text/markdown; charset=utf-8");
  } catch (error) {
    if (error instanceof AppError) return done(404);
    throw error;
  }
}

// GET /chest/spaces/<id>/export: a whole space as a zip of Markdown files
// in folders, with its images and files.
export async function exportSpace(request: Request, actor: Member, spaceId: string): Promise<Response> {
  try {
    const t = catalogue(localeOf(actor.language));
    const out = await exportZip(db(), actor, { spaceId }, origin(request), { missing: t.page.missing });
    return download(out.data, out.name, "application/zip");
  } catch (error) {
    if (error instanceof AppError) return done(404);
    throw error;
  }
}

// GET /chest/export: every space the member sees, one zip (a folder per
// space) — a backup, or everything to take along. Named by the day in the
// member's zone and language ("Wiki 06-10-2026").
export async function exportAll(request: Request, actor: Member): Promise<Response> {
  try {
    const locale = localeOf(actor.language);
    const t = catalogue(locale);
    const name = `${t.tool.name} ${formatDate(new Date(), locale, { year: "numeric", month: "2-digit", day: "2-digit", timeZone: actor.timeZone }).replace(/\//gu, "-")}`;
    const out = await exportZip(db(), actor, { all: name }, origin(request), { missing: t.page.missing });
    return download(out.data, out.name, "application/zip");
  } catch (error) {
    if (error instanceof AppError) return done(404);
    throw error;
  }
}

// GET /chest/pages/<id>/reads/csv: who confirmed reading a page, as a
// table for the company's records (the page's editors only): one line per
// person asked, with the version they confirmed and when (UTC, ISO 8601).
export async function readsCsv(actor: Member, pageId: string): Promise<Response> {
  try {
    const locale = localeOf(actor.language);
    const t = catalogue(locale);
    const { page: p, ask, rows } = await report(db(), actor, pageId);
    const who = await people(rows.map(r => r.memberId));
    const status = (r: (typeof rows)[number]) => (r.version === null ? t.reads.notYet : r.current ? t.reads.done : format(t.reads.older, { version: r.version }));
    const lines = [
      [t.reads.csv.page, t.reads.csv.asked, t.reads.csv.person, t.reads.csv.status, t.reads.csv.version, t.reads.csv.at],
      ...rows.map(r => [p.title, String(ask.version), nameOf(who.get(r.memberId), locale), status(r), r.version === null ? "" : String(r.version), r.at ? r.at.toISOString() : ""]),
    ];
    const text = "﻿" + lines.map(l => l.map(csvCell).join(",")).join("\r\n") + "\r\n";
    const name = `${p.title.replace(/[\\/:*?"<>|\p{Cc}]+/gu, " ").trim() || "page"} - ${t.reads.menuSeen}.csv`;
    return download(text, name, "text/csv; charset=utf-8");
  } catch (error) {
    if (error instanceof AppError) return done(404);
    throw error;
  }
}
