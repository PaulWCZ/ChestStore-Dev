import * as webhooks from "@argentic/chest-sdk/webhooks";
import { db } from "../../lib/db.ts";
import { hookDisabled } from "../../lib/hooks.ts";

// The Chest's word about the updates it delivers to Slack, Teams and web
// addresses (Proposal (studio): webhooks): an address kept failing, or is
// gone, so the Chest stopped it. Its subscription's page says so and
// offers "Try again". Signed by the Chest, at least once; never under
// /chest.
export async function POST(request: Request): Promise<Response> {
  return new Response(null, { status: await webhooks.handle(request, { disabled: async event => { await hookDisabled(db(), event); } }) });
}
