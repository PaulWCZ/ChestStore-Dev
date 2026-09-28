import * as checks from "@argentic/chest-sdk/checks";
import { db } from "../../lib/db.ts";
import { receive } from "../../lib/check-results.ts";

// Results of the checks the Chest runs (Proposal (studio): checks), signed,
// at least once. Outside /chest, never behind a session.
export async function POST(request: Request): Promise<Response> {
  return new Response(null, { status: await checks.handle(request, result => receive(db(), result)) });
}
