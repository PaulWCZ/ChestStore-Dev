import { member } from "@argentic/chest-sdk/member";
import { AppError } from "../../../../lib/app-error.ts";
import { db } from "../../../../lib/db.ts";
import { subscribersCsv } from "../../../../lib/export.ts";

// The subscribers, as a spreadsheet (lib/export.ts).
export async function GET(request: Request): Promise<Response> {
  const who = member(request);
  if (!who) return new Response(null, { status: 401 });
  try {
    const day = new Date().toISOString().slice(0, 10);
    return new Response("﻿" + await subscribersCsv(db(), who), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="status-subscribers-${day}.csv"`, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 403 });
    throw error;
  }
}
