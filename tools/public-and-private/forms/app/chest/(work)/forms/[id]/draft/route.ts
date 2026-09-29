import { member } from "@argentic/chest-sdk/member";
import { AppError } from "../../../../../../lib/app-error.ts";
import { db } from "../../../../../../lib/db.ts";
import { saveDraft } from "../../../../../../lib/forms.ts";

// The builder's last save when the page goes away (a closed tab, a link
// followed before the save ran): a fetch with keepalive, which the browser
// finishes after the page is gone — a server action would be cut off. The
// same rules as every save: the member from the Chest's assertion, their
// level on the form, the revision they loaded. Only from the tool's own
// pages (the browser's Sec-Fetch-Site, or the Origin of the request).
const answer = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const who = member(request);
  if (!who) return answer({ error: "forbidden" }, 401);
  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (site ? site !== "same-origin" : !origin || !host || new URL(origin).host !== host) return answer({ error: "forbidden" }, 403);
  const body = (await request.json().catch(() => null)) as { text?: unknown; revision?: unknown } | null;
  if (!body) return answer({ error: "invalid" }, 400);
  try {
    return answer(await saveDraft(db(), who, (await params).id, body.text, body.revision));
  } catch (error) {
    if (error instanceof AppError) return answer({ error: error.code }, error.code === "conflict" ? 409 : error.code === "not_found" ? 404 : 400);
    throw error;
  }
}
