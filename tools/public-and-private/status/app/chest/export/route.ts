import { member } from "@argentic/chest-sdk/member";
import { AppError } from "../../../lib/app-error.ts";
import { db } from "../../../lib/db.ts";
import { exportAll } from "../../../lib/export.ts";

// Download everything (lib/export.ts), as one JSON file.
export async function GET(request: Request): Promise<Response> {
  const who = member(request);
  if (!who) return new Response(null, { status: 401 });
  try {
    const body = await exportAll(db(), who);
    const day = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(body, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="status-export-${day}.json"`, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 403 });
    throw error;
  }
}
