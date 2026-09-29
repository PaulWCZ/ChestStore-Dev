import { db } from "../../lib/db.ts";
import { feedData, xml } from "../../lib/public-feed.ts";
import { sitemap } from "../../lib/reach.ts";

// The careers page and its open jobs, for search engines.
export async function GET(): Promise<Response> {
  const { jobs, origin } = await feedData(db());
  return xml(sitemap(jobs, origin));
}

// Read at each request: the jobs change, the disk is read-only.
export const dynamic = "force-dynamic";
