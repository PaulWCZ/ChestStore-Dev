import { ChestError } from "@argentic/chest-sdk/errors";
import { can } from "../../../../lib/access.ts";
import { db } from "../../../../lib/db.ts";
import { AppError } from "../../../../lib/errors.ts";
import { catalogue, isLocale } from "../../../../lib/i18n/index.ts";
import { importFiles } from "../../../../lib/importer.ts";
import { limits } from "../../../../lib/model.ts";
import { currentMember } from "../../../../lib/session.ts";

// The import's files, sent by the page as a form: read in memory (the
// Chest gives no disk), bounded before they are read.
const answer = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  const actor = await currentMember();
  if (!actor || !can(actor, "import")) return answer({ error: "forbidden" }, 403);
  const size = Number(request.headers.get("content-length") ?? "0");
  if (size > limits.importBytes + (1 << 20)) return answer({ error: "file_too_large" }, 413);
  try {
    const form = await request.formData();
    const files = [];
    for (const entry of form.getAll("files")) {
      if (typeof entry === "string") continue;
      files.push({ name: entry.name, data: new Uint8Array(await entry.arrayBuffer()) });
    }
    if (files.length === 0) return answer({ error: "import_empty" }, 400);
    const t = catalogue(isLocale(actor.locale) ? actor.locale : "en");
    const space = form.get("space");
    const name = form.get("name");
    const result = await importFiles(db(), actor, {
      ...(typeof space === "string" && space ? { spaceId: space } : { spaceName: typeof name === "string" && name.trim() ? name : t.importer.defaultName }),
      files,
      words: { untitled: t.importer.untitled, attachments: t.importer.attachments },
    });
    return answer(result);
  } catch (error) {
    if (error instanceof AppError) return answer({ error: error.code, values: error.values }, error.code === "forbidden" ? 403 : error.code === "not_found" ? 404 : 400);
    if (error instanceof ChestError) return answer({ error: "unavailable" }, 503);
    if (error instanceof TypeError) return answer({ error: "import_invalid" }, 400);
    console.error("import failed", error instanceof Error ? error.name : "non-error");
    return answer({ error: "unknown" }, 500);
  }
}
