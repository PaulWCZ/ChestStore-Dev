import { ChestError } from "@argentic/chest-sdk/errors";
import { db } from "../../../../../../lib/db.ts";
import { AppError } from "../../../../../../lib/errors.ts";
import { leave } from "../../../../../../lib/editing.ts";
import { currentMember } from "../../../../../../lib/session.ts";

// The editor closing without "Save" or "Stop editing" — a closed tab, the
// back button, a link elsewhere: the browser sends it as a beacon
// (navigator.sendBeacon, text/plain so that no preflight is needed), with
// the latest draft when it is small enough. The page's lock is given back
// at once, the draft kept. Only from the wiki's own pages.
const done = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

function sameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  try {
    return new URL(origin).host === (request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
  } catch {
    return false;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!sameOrigin(request)) return done(403);
  try {
    const { id } = await params;
    const text = (await request.text()).slice(0, 2_100_000);
    let draft: { title: unknown; doc: unknown; baseVersion: unknown } | undefined;
    if (text) {
      try {
        const body = JSON.parse(text) as { title?: unknown; doc?: unknown; baseVersion?: unknown };
        if (body && typeof body === "object" && body.doc !== undefined) draft = { title: body.title, doc: body.doc, baseVersion: body.baseVersion };
      } catch {
        draft = undefined;
      }
    }
    await leave(db(), await currentMember(), id, draft);
    return done(204);
  } catch (error) {
    if (error instanceof AppError) return done(error.code === "not_found" ? 404 : 403);
    if (error instanceof ChestError) return done(503);
    throw error;
  }
}
