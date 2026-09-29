import { db } from "../../../lib/db.ts";
import { AppError } from "../../../lib/errors.ts";
import { exportZip } from "../../../lib/export.ts";
import { viewer } from "../../../lib/session.ts";

// Every ticket and every message, as a ZIP (lib/export.ts): two
// spreadsheets and one JSON file, headers in the reader's language.
export async function GET(): Promise<Response> {
  const v = await viewer();
  if (!v) return new Response(null, { status: 401 });
  try {
    const data = await exportZip(db(), v.member, v.t, v.locale);
    const day = new Date().toISOString().slice(0, 10);
    return new Response(new Uint8Array(data), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="support-export-${day}.zip"`, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 403 });
    throw error;
  }
}
