import type { Sql } from "./db.ts";
import { salaryText, type Salary } from "../shared/facts.ts";
import { catalogue, isLocale } from "../i18n/index.ts";
import { imagePath } from "./careers.ts";
import { publicJobs, settings, type PublicJob, type Settings } from "./jobs.ts";
import { publicOrigin } from "./public-origin.ts";
import type { Company, ReachJob } from "./reach.ts";

// What the feeds, the sitemap and the job pages' structured data read: the
// open jobs, the company, the careers page's address (the Chest's word:
// the company's own domain once connected).
export async function feedData(sql: Sql): Promise<{ jobs: ReachJob[]; company: Company; origin: string; settings: Settings }> {
  const s = await settings(sql);
  const origin = publicOrigin() ?? "";
  const jobs = s.careersOpen ? (await publicJobs(sql)).map(reachJob) : [];
  return { jobs, company: companyOf(s, origin), origin, settings: s };
}

export const reachJob = (j: PublicJob): ReachJob => ({ ...j, salary: j.salary });

export function companyOf(s: Settings, origin: string): Company {
  return { name: s.companyName || catalogue("en").careers.titlePlain, website: s.website, logo: s.logo ? origin + imagePath(s.logo) : null };
}

// A job's salary in its own language, as its page writes it.
export function salaryWords(j: ReachJob): string {
  const locale = isLocale(j.language) ? j.language : "en";
  return j.salary ? salaryText(j.salary as Salary, catalogue(locale).facts, locale) : "";
}

// A feed's answer: XML, cached ten minutes by browsers and crawlers.
export const xml = (body: string, type = "application/xml") => new Response(body, { headers: { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "public, max-age=600" } });
