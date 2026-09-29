import * as mail from "@argentic/chest-sdk/mail";
import { db } from "../../lib/db.ts";
import { seen } from "../../lib/lifecycle.ts";
import { bounced, received } from "../../lib/mail-in.ts";
import { refreshBadges } from "../../lib/tell.ts";

// Emails sent to the jobs mailbox — a candidate's answer — and the bounces
// of what the tool sent (Proposal (studio): the Chest posts each here,
// signed Chest-Mail, at least once; `seen` files each delivery once).
// lib/mail-in.ts says what happens.
export async function POST(request: Request): Promise<Response> {
  const sql = db();
  return new Response(null, {
    status: await mail.handle(request, {
      message: async message => {
        await received(sql, message);
        await refreshBadges(sql);
      },
      bounce: bounce => bounced(sql, bounce),
    }, { seen: seen(sql) }),
  });
}
