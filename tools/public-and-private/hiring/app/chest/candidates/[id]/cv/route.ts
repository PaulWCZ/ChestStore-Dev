import { ChestError } from "@argentic/chest-sdk/errors";
import * as files from "@argentic/chest-sdk/files";
import { AppError } from "../../../../../lib/app-error.ts";
import { cvOf } from "../../../../../lib/candidates.ts";
import { db } from "../../../../../lib/db.ts";
import { isPictureCv } from "../../../../../lib/model.ts";
import { currentMember } from "../../../../../lib/session.ts";

// A candidate's CV for whoever sees the candidate, served by the tool
// itself (10 MB at most): its name is the candidate's ("Lucie Garnier -
// CV.pdf", not the file's opaque name), a PDF opens inline — framed by the
// candidate's page only, in a sandbox — as does a photo of a CV (JPEG,
// PNG); ?download saves it. A Word or HEIC file is always saved.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await params;
    const file = await cvOf(db(), await currentMember(), id);
    const body = await files.get(file.object);
    if (!body) return new Response(null, { status: 404 });
    // A PDF or a photo (JPEG, PNG) shows on the page; Word and HEIC are saved.
    const pdf = file.type === "application/pdf" || isPictureCv(file.type);
    const download = !pdf || new URL(request.url).searchParams.has("download");
    const name = file.fileName || "cv." + (file.object.split(".").pop() ?? "pdf");
    const ascii = name.replace(/[^\x20-\x7e]/gu, "_").replace(/["\\]/gu, "_");
    return new Response(new Uint8Array(body.data), {
      headers: {
        "Content-Type": file.type,
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Content-Security-Policy": "sandbox; default-src 'none'; frame-ancestors 'self'",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 404 });
    if (error instanceof ChestError) return new Response(null, { status: error.code === "not_found" ? 404 : 503 });
    throw error;
  }
}
