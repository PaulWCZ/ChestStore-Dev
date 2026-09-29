import * as webhooks from "@argentic/chest-sdk/webhooks";
import { db } from "../../lib/db.ts";
import { disabled } from "../../lib/notices.ts";
import { noticeStopped } from "../../lib/tell.ts";

// The Chest's word about the notices it delivers (Proposal (studio):
// webhooks): a channel's address kept failing, or is gone, so the Chest
// stopped it. Settings shows it stopped, and the administrators are told.
// Signed by the Chest, at least once; never under /chest.
export async function POST(request: Request): Promise<Response> {
  return new Response(null, {
    status: await webhooks.handle(request, {
      disabled: async event => {
        const target = await disabled(db(), event);
        if (target) await noticeStopped(target);
      },
    }),
  });
}
