import { AppError } from "../../../../../lib/app-error.ts";
import { exportRows } from "../../../../../lib/candidates.ts";
import { toCsv } from "../../../../../lib/csv.ts";
import { db } from "../../../../../lib/db.ts";
import { slugify } from "../../../../../lib/model.ts";
import { viewer } from "../../../../../lib/session.ts";
import { stageLabel } from "../../../../../lib/stages.ts";

// A job's candidates as a spreadsheet, headers and words in the reader's
// language.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const v = await viewer();
  if (!v) return new Response(null, { status: 401 });
  try {
    const { id } = await params;
    const { job, rows } = await exportRows(db(), v.member, id);
    const h = v.t.export.headers;
    const csv = toCsv([
      [h.name, h.email, h.phone, h.link, h.stage, h.status, h.reason, h.rating, h.ratings, h.source, h.applied, h.activity],
      ...rows.map(r => [r.name, r.email, r.phone, r.link, stageLabel(r.stage, v.t.jobSettings.defaults), v.t.export.status[r.status], r.rejectReason ? v.t.reject.reasons[r.rejectReason] : "", r.rating ?? "", r.ratings, v.t.candidate.source[r.source as keyof typeof v.t.candidate.source], r.appliedAt.slice(0, 10), r.lastActivityAt.slice(0, 10)]),
    ]);
    const name = `${v.t.export.file}-${slugify(job.title)}.csv`;
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: error.code === "not_found" ? 404 : 403 });
    throw error;
  }
}
