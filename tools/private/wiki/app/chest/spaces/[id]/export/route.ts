import { localeOf } from "@argentic/chest-sdk/member";
import { db } from "../../../../../lib/db.ts";
import { AppError } from "../../../../../lib/errors.ts";
import { attachment, exportZip } from "../../../../../lib/export.ts";
import { catalogue } from "../../../../../lib/i18n/index.ts";
import { origin } from "../../../../../lib/origin.ts";
import { currentMember } from "../../../../../lib/session.ts";

// A whole space as a zip of Markdown files in folders, with its images and
// files: the wiki never holds a company's words hostage.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const actor = await currentMember();
    const t = catalogue(localeOf(actor?.language ?? "en"));
    const out = await exportZip(db(), actor, { spaceId: id }, origin(request), { missing: t.page.missing });
    return new Response(out.data, { headers: { "Content-Type": "application/zip", "Content-Disposition": attachment(out.name), "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 404 });
    throw error;
  }
}
