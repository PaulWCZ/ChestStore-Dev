import * as chest from "@argentic/chest-sdk/chest";
import { pdfOf } from "../../../../../lib/archive.ts";
import { db } from "../../../../../lib/db.ts";
import { asker, failure, refuse } from "../../../../../lib/http.ts";

// A document's PDF, for whoever may read it: an issued invoice or credit
// note as it was kept, a quote or a draft drawn now. Opened in the browser;
// ?download to save it.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const who = asker(request);
  if (!who) return refuse("forbidden", 401);
  try {
    const { id } = await params;
    const { bytes, fileName } = await pdfOf(db(), who.actor, id, chest.today());
    const disposition = new URL(request.url).searchParams.has("download") ? "attachment" : "inline";
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${fileName.replace(/[^A-Za-z0-9._-]/gu, "_")}"`,
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'self'",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
