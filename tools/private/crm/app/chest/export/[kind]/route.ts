import { db } from "../../../../lib/db.ts";
import { AppError } from "../../../../lib/errors.ts";
import { companiesCsv, contactsCsv, contactsVcf, dealsCsv, everything } from "../../../../lib/export.ts";
import { fieldFilterOf } from "../../../../lib/fields.ts";
import { viewer } from "../../../../lib/session.ts";

// A list as a file, with the filters of the page it came from: companies,
// contacts or deals as CSV (in the reader's words), contacts as vCards; or
// the whole client book as one ZIP (a manager).
export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }): Promise<Response> {
  const v = await viewer();
  if (!v) return new Response(null, { status: 401 });
  const { kind } = await params;
  const q = new URL(request.url).searchParams;
  const get = (key: string) => q.get(key) ?? "";
  const sql = db();
  const stamp = new Date().toISOString().slice(0, 10);
  const field = fieldFilterOf(get);
  const withField = field ? { field } : {};
  try {
    if (kind === "all") {
      const bytes = await everything(sql, v.member, v.locale, v.t);
      return new Response(bytes as unknown as BodyInit, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="clients-${stamp}.zip"`, "Cache-Control": "no-store" } });
    }
    let body: string;
    let type = "text/csv; charset=utf-8";
    let name: string;
    if (kind === "companies") {
      body = await companiesCsv(sql, v.member, { q: get("q"), owner: get("owner"), tag: get("tag"), ...withField }, v.t, v.locale);
      name = `companies-${stamp}.csv`;
    } else if (kind === "contacts") {
      body = await contactsCsv(sql, v.member, { q: get("q"), owner: get("owner"), tag: get("tag"), stale: get("stale") === "1", ...withField }, v.t, v.locale);
      name = `contacts-${stamp}.csv`;
    } else if (kind === "deals") {
      const status = get("status");
      body = await dealsCsv(sql, v.member, { q: get("q"), owner: get("owner"), stage: get("stage"), closing: get("closing") === "month" ? "month" : "", status: status === "won" || status === "lost" ? status : status === "any" ? "" : "open", ...withField }, v.t, v.locale);
      name = `deals-${stamp}.csv`;
    } else if (kind === "vcf") {
      body = await contactsVcf(sql, v.member, { q: get("q"), owner: get("owner"), tag: get("tag"), stale: get("stale") === "1", ...withField });
      type = "text/vcard; charset=utf-8";
      name = `contacts-${stamp}.vcf`;
    } else return new Response(null, { status: 404 });
    return new Response(body, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: error.code === "forbidden" ? 403 : 404 });
    throw error;
  }
}
