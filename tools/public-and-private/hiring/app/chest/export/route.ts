import { chest } from "@argentic/chest-sdk/chest";
import { AppError } from "../../../lib/app-error.ts";
import { db } from "../../../lib/db.ts";
import { everything } from "../../../lib/export-all.ts";
import { viewer } from "../../../lib/session.ts";
import { zipStream } from "../../../lib/zip.ts";

// Everything, as one archive: spreadsheets and CVs, words in the reader's
// language (lib/export-all.ts). Streamed: one CV in memory at a time.
export async function GET(): Promise<Response> {
  const v = await viewer();
  if (!v) return new Response(null, { status: 401 });
  const entries = everything(db(), v.member, v.t);
  // The rights are checked before the first byte: a refusal is a status.
  try {
    const first = await entries.next();
    const rest = (async function* () {
      if (!first.done) yield first.value;
      yield* entries;
    })();
    const name = `${v.t.exportAll.file}-${chest.today()}.zip`;
    return new Response(zipStream(rest), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: 404 });
    throw error;
  }
}
