import { db } from "../../lib/db.ts";
import { format } from "../../lib/i18n/index.ts";
import { introFor } from "../../lib/jobs.ts";
import { feedData, xml } from "../../lib/public-feed.ts";
import { rssFeed } from "../../lib/reach.ts";
import { publicWords } from "../../lib/session.ts";

// The open jobs as an RSS 2.0 feed, in the visitor's language.
export async function GET(): Promise<Response> {
  const { t, locale } = await publicWords();
  const { jobs, company, origin, settings } = await feedData(db());
  const channel = { title: format(t.careers.title, { company: company.name }), description: introFor(settings, locale) || t.careers.intro, language: locale };
  const facts = (j: (typeof jobs)[number]) => [j.team, j.place, t.facts.contract[j.contract], t.facts.remote[j.remote]].filter(Boolean).join(" · ");
  return xml(rssFeed(jobs, channel, origin, facts), "application/rss+xml");
}
