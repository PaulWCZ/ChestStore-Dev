import * as chest from "@argentic/chest-sdk/chest";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { db } from "../../../../lib/db.ts";
import { openLink, shownPdf } from "../../../../lib/online.ts";
import { pdfFileName } from "../../../../lib/pdf/document.ts";

// The quote's PDF for the client who holds its link: the very file their
// answer was given on once they answered, otherwise the one the page shows
// now. Nothing for a link that was turned off. ?download to save it.
export async function GET(request: Request, { params }: { params: Promise<{ secret: string }> }): Promise<Response> {
  const { secret } = await params;
  const sql = db();
  const opened = await openLink(sql, secret, chest.today());
  if (!opened || opened.showing === "off") return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  let bytes: Uint8Array | null = null;
  if (opened.answer?.pdfObject) {
    const kept = await files.get(opened.answer.pdfObject).catch(error => { if (error instanceof ChestError) return null; throw error; });
    bytes = kept?.data ?? null;
  }
  try {
    bytes ??= (await shownPdf(sql, opened, chest.today())).bytes;
  } catch (error) {
    if (!(error instanceof ChestError)) throw error;
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const disposition = new URL(request.url).searchParams.has("download") ? "attachment" : "inline";
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${pdfFileName(opened.full).replace(/[^A-Za-z0-9._-]/gu, "_")}"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
