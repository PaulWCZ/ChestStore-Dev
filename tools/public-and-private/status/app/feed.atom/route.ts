import { atomFeed, feedHeaders } from "../../lib/feeds.ts";

// The incidents as an Atom feed (public).
export async function GET(): Promise<Response> {
  return new Response(await atomFeed(), { headers: feedHeaders("application/atom+xml; charset=utf-8") });
}
