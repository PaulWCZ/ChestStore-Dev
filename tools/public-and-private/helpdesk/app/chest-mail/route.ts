import * as mail from "@argentic/chest-sdk/mail";
import { db } from "../../lib/db.ts";
import { seen } from "../../lib/lifecycle.ts";
import { bounced, received } from "../../lib/mail-in.ts";
import { tellLinkedTools } from "../../lib/ticket-events.ts";

// Email sent to the support mailbox, and the bounces of what the tool sent
// (Proposal (studio): the Chest posts each here, signed, at least once —
// `seen` files each delivery once). lib/mail-in.ts says what happens.
export async function POST(request: Request): Promise<Response> {
  const sql = db();
  const status = await mail.handle(request, { message: message => received(sql, message), bounce: bounce => bounced(sql, bounce) }, { seen: seen(sql) });
  // A customer's email on a solved ticket reopens it: the linked tools told.
  await tellLinkedTools(sql);
  return new Response(null, { status });
}
