import * as chest from "@argentic/chest-sdk/chest";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { AppError } from "../../../../lib/app-error.ts";
import { db } from "../../../../lib/db.ts";
import { openLink, shownPdf } from "../../../../lib/online.ts";
import { pdfFileName } from "../../../../lib/pdf/document.ts";
import { versionPdf } from "../../../../lib/versions.ts";

// The quote's PDF for the client who holds its link: the very file their
// answer was given on once they answered, otherwise the one the page shows
// now. Nothing for a link that was turned off. ?version=<n> gives an
// earlier version of the quote, as it was sent. ?download to save it.
export async function GET(request: Request, { params }: { params: Promise<{ secret: string }> }): Promise<Response> {
  const { secret } = await params;
  const sql = db();
  const opened = await openLink(sql, secret, chest.today());
  if (!opened || opened.showing === "off") return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const url = new URL(request.url);
  const disposition = url.searchParams.has("download") ? "attachment" : "inline";
  // An earlier version, as it was sent (?version=1).
  const asked = url.searchParams.get("version");
  if (asked !== null) {
    try {
      const found = await versionPdf(sql, opened.full.id, asked);
      if (found.version >= opened.full.version) throw new AppError("not_found");
      return pdfResponse(found.bytes, pdfFileName({ ...opened.full, version: found.version }), disposition);
    } catch (error) {
      if (error instanceof AppError) return new Response(null, { status: error.code === "file_missing" ? 503 : 404, headers: { "Cache-Control": "no-store" } });
      throw error;
    }
  }
  if (opened.showing === "revising") return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
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
  return pdfResponse(bytes, pdfFileName(opened.full), disposition);
}

function pdfResponse(bytes: Uint8Array, fileName: string, disposition: string): Response {
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${fileName.replace(/[^A-Za-z0-9._-]/gu, "_")}"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
