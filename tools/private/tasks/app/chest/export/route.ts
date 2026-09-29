import { db } from "../../../lib/db.ts";
import { AppError } from "../../../lib/errors.ts";
import { everything } from "../../../lib/export.ts";
import { viewer } from "../../../lib/session.ts";

// Every board at once, in one JSON file (managers only): what a company
// takes with it when it leaves.
export async function GET(): Promise<Response> {
  const v = await viewer();
  if (!v) return new Response(null, { status: 401 });
  try {
    const json = await everything(db(), v.member);
    return new Response(json, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="tasks-all-boards.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: error.code === "forbidden" ? 403 : 404 });
    throw error;
  }
}
