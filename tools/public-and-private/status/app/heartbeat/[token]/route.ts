import { allComponents } from "../../../lib/components.ts";
import { db } from "../../../lib/db.ts";
import { beat } from "../../../lib/heartbeats.ts";
import { heartbeatChanged } from "../../../lib/tell.ts";

// A heartbeat (lib/heartbeats.ts): a job calls this secret address after
// each run — GET or POST, nothing to send (`curl -fsS <address>`). The
// answer says nothing but "received" or "unknown"; never cached.
async function receive(params: Promise<{ token: string }>): Promise<Response> {
  const sql = db();
  const found = await beat(sql, (await params).token);
  if (!found) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (found.back) {
    const name = (await allComponents(sql)).find(c => c.id === found.componentId)?.name ?? "";
    await heartbeatChanged({ componentId: found.componentId, kind: "up", since: new Date() }, name).catch(() => {});
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }): Promise<Response> {
  return receive(context.params);
}

export async function POST(_request: Request, context: { params: Promise<{ token: string }> }): Promise<Response> {
  return receive(context.params);
}

export const dynamic = "force-dynamic";
