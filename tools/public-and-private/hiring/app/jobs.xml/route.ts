import { db } from "../../lib/db.ts";
import { feedData, salaryWords, xml } from "../../lib/public-feed.ts";
import { indeedFeed } from "../../lib/reach.ts";

// The open jobs in Indeed's XML feed format (lib/reach.ts): the address a
// recruiter gives Indeed (or an aggregator) once; they come back to read it.
export async function GET(): Promise<Response> {
  const { jobs, company, origin } = await feedData(db());
  return xml(indeedFeed(jobs, company, origin, salaryWords));
}
