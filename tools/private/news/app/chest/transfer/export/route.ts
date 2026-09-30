import { chest } from "@argentic/chest-sdk/chest";
import { db } from "../../../../lib/db.ts";
import { AppError } from "../../../../lib/errors.ts";
import { currentMember } from "../../../../lib/session.ts";
import { exportAll } from "../../../../lib/transfer.ts";
import { chestZone } from "../../../../lib/zone.ts";

// "Download all posts": the posts the publisher sees, as one ZIP.
export async function GET(): Promise<Response> {
  try {
    const zip = await exportAll(db(), await currentMember(), chestZone());
    return new Response(zip, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="news-${chest.today()}.zip"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: error.code === "forbidden" ? 403 : 404 });
    throw error;
  }
}
