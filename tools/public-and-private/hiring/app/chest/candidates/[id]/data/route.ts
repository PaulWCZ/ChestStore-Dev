import { AppError } from "../../../../../lib/app-error.ts";
import { db } from "../../../../../lib/db.ts";
import { theirData } from "../../../../../lib/export-all.ts";
import { viewer } from "../../../../../lib/session.ts";
import { zipStream } from "../../../../../lib/zip.ts";

// A candidate's own data, for their right of access: what they sent, what
// the team wrote about them, the emails and interviews, their CV.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const v = await viewer();
  if (!v) return new Response(null, { status: 401 });
  try {
    const { id } = await params;
    const { name, entries } = await theirData(db(), v.member, id, v.t);
    return new Response(zipStream(entries), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 404 });
    throw error;
  }
}
