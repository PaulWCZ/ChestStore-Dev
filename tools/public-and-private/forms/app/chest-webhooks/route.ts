import * as webhooks from "@argentic/chest-sdk/webhooks";
import { db } from "../../lib/db.ts";
import { stopped } from "../../lib/hooks.ts";
import { format } from "../../lib/i18n/index.ts";
import { notify } from "../../lib/notify.ts";

// The Chest's word about the web addresses it delivers answers to
// (Proposal (studio): webhooks): one kept failing, or is gone, so the Chest
// stopped it. The form's Settings shows it stopped (Try again), and its
// owner is told in the bell. Signed by the Chest, at least once; never
// under /chest.
export async function POST(request: Request): Promise<Response> {
  return new Response(null, {
    status: await webhooks.handle(request, {
      disabled: async event => {
        const hook = await stopped(db(), event);
        if (hook && hook.owner.startsWith("mbr_")) {
          await notify([hook.owner], t => ({ title: format(t.bell.hookStopped, { label: hook.label, form: hook.title || t.builder.untitled }) }), { path: `/chest/forms/${hook.formId}/settings`, key: `hook:${event.target}` });
        }
      },
    }),
  });
}
