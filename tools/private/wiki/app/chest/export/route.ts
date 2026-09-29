import { db } from "../../../lib/db.ts";
import { AppError } from "../../../lib/errors.ts";
import { attachment, exportZip } from "../../../lib/export.ts";
import { catalogue, formatDate, isLocale } from "../../../lib/i18n/index.ts";
import { origin } from "../../../lib/origin.ts";
import { currentMember } from "../../../lib/session.ts";

// Every space the member sees, in one zip: a folder per space, Markdown
// files in folders, images and files, links between pages intact — a
// backup, or everything to take along.
export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await currentMember();
    const locale = isLocale(actor?.locale) ? actor!.locale : "en";
    const t = catalogue(locale);
    const name = `${t.meta.name} ${formatDate(new Date(), locale, { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\//gu, "-")}`;
    const out = await exportZip(db(), actor, { all: name }, origin(request), { missing: t.page.missing });
    return new Response(out.data, { headers: { "Content-Type": "application/zip", "Content-Disposition": attachment(out.name), "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 404 });
    throw error;
  }
}
