import { db } from "../../../../../lib/db.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { attachment, exportZip, pageHtml, pageMarkdown } from "../../../../../lib/export.ts";
import { catalogue, format, formatDate, isLocale } from "../../../../../lib/i18n/index.ts";
import { page } from "../../../../../lib/pages.ts";
import { nameOf, people } from "../../../../../lib/people.ts";
import { currentMember } from "../../../../../lib/session.ts";
import { origin } from "../../../../../lib/origin.ts";

// A page to keep: Markdown, a web page of its own (images inside, ready to
// print), or a zip with the pages inside it.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const actor = await currentMember();
    const locale = isLocale(actor?.locale) ? actor!.locale : "en";
    const t = catalogue(locale);
    const sql = db();
    const kind = new URL(request.url).searchParams.get("format");
    const base = origin(request);
    const headers = (name: string, type: string) => ({ "Content-Type": type, "Content-Disposition": attachment(name), "Cache-Control": "no-store" });
    if (kind === "html") {
      const p = await page(sql, actor, id);
      const author = nameOf((await people([p.updatedBy])).get(p.updatedBy), locale);
      const meta = format(t.export.meta, { date: formatDate(new Date(), locale, { dateStyle: "long" }), version: p.version, name: author });
      const out = await pageHtml(sql, actor, id, base, { missing: t.page.missing, lang: locale, meta });
      return new Response(out.html, { headers: headers(out.name, "text/html; charset=utf-8") });
    }
    if (kind === "zip") {
      const out = await exportZip(sql, actor, { pageId: id }, base, { missing: t.page.missing });
      return new Response(out.data, { headers: headers(out.name, "application/zip") });
    }
    const out = await pageMarkdown(sql, actor, id, base, { missing: t.page.missing });
    return new Response(out.text, { headers: headers(out.name, "text/markdown; charset=utf-8") });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 404 });
    throw error;
  }
}
