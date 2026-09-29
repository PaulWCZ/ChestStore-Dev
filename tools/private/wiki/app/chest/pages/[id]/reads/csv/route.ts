import { db } from "../../../../../../lib/db.ts";
import { AppError } from "../../../../../../lib/errors.ts";
import { attachment } from "../../../../../../lib/export.ts";
import { catalogue, format, isLocale } from "../../../../../../lib/i18n/index.ts";
import { nameOf, people } from "../../../../../../lib/people.ts";
import { csvCell, report } from "../../../../../../lib/reads.ts";
import { currentMember } from "../../../../../../lib/session.ts";

// Who confirmed reading a page, as a table for the company's records
// (the page's editors only): one line per person asked, with the version
// they confirmed and when (UTC, ISO 8601).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const actor = await currentMember();
    const locale = isLocale(actor?.locale) ? actor!.locale : "en";
    const t = catalogue(locale);
    const { page, ask, rows } = await report(db(), actor, id);
    const who = await people(rows.map(r => r.memberId));
    const status = (r: (typeof rows)[number]) => (r.version === null ? t.reads.notYet : r.current ? t.reads.done : format(t.reads.older, { version: r.version }));
    const lines = [
      [t.reads.csv.page, t.reads.csv.asked, t.reads.csv.person, t.reads.csv.status, t.reads.csv.version, t.reads.csv.at],
      ...rows.map(r => [page.title, String(ask.version), nameOf(who.get(r.memberId), locale), status(r), r.version === null ? "" : String(r.version), r.at ? r.at.toISOString() : ""]),
    ];
    const text = "﻿" + lines.map(l => l.map(csvCell).join(",")).join("\r\n") + "\r\n";
    const name = `${page.title.replace(/[\\/:*?"<>|\p{Cc}]+/gu, " ").trim() || "page"} - ${t.reads.menuSeen}.csv`;
    return new Response(text, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": attachment(name), "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 404 });
    throw error;
  }
}
