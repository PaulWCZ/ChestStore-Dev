import { chest } from "@argentic/chest-sdk/chest";
import { db } from "../../../../../../lib/db.ts";
import { getDocument } from "../../../../../../lib/documents.ts";
import { asker, failure, refuse } from "../../../../../../lib/http.ts";
import { versionPdf } from "../../../../../../lib/versions.ts";

// The PDF of a quote's earlier version, as its client was shown it, for
// whoever may read the quote.
export async function GET(request: Request, { params }: { params: Promise<{ id: string; version: string }> }): Promise<Response> {
  const who = asker(request);
  if (!who) return refuse("forbidden", 401);
  try {
    const { id, version } = await params;
    const full = await getDocument(db(), who.actor, id, chest.today());
    if (full.type !== "quote") return refuse("not_found", 404);
    const found = await versionPdf(db(), full.id, version);
    return new Response(Buffer.from(found.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${`${found.number}-v${found.version}`.replace(/[^A-Za-z0-9._-]/gu, "_")}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
