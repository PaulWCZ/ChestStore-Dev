import { Island } from "@argentic/chest-app";
import { ChestError } from "@argentic/chest-sdk/errors";
import * as members from "@argentic/chest-sdk/members";
import { EmptyState } from "@argentic/chest-ui/components";
import { Back, Search } from "../components/icons.tsx";
import { when } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { findPerson, type Found } from "../lib/answers.ts";
import { AppError } from "../lib/app-error.ts";
import { nameOf, people } from "../lib/people.ts";
import type { Ctx } from "./context.ts";

// A person asks for their answers to be deleted (GDPR): a manager finds
// them by email address or name and erases them, files included.
export async function privacyPage({ sql, member, t, lang, zone, query }: Ctx) {
  if (!can(member, "privacy.erase")) return { title: t.privacy.title, body: <div className="narrow"><EmptyState headingLevel={1} title={t.privacy.forbidden} /></div> };
  const q = (query("q") ?? "").trim().slice(0, 254);
  let found: Found[] | null = null;
  if (q) {
    // A member's name finds their answers to named team forms too.
    let ids: string[] = [];
    try {
      ids = (await members.list({ q, limit: 20 })).members.map(m => m.id);
    } catch (error) {
      if (!(error instanceof ChestError)) throw error;
    }
    try {
      const byText = await findPerson(sql, member, q);
      const byMember = (await Promise.all(ids.map(id => findPerson(sql, member, id)))).flat();
      const seen = new Set<string>();
      found = [...byText, ...byMember].filter(f => (seen.has(f.id) ? false : (seen.add(f.id), true)));
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      found = [];
    }
  }
  const who = await people((found ?? []).flatMap(f => (f.respondent ? [f.respondent] : [])));
  return {
    title: t.privacy.title,
    body: (
      <div className="narrow">
        <a className="back-link" href="/chest"><Back />{t.shell.home}</a>
        <h1 className="page-title">{t.privacy.title}</h1>
        <p className="lede">{t.privacy.lede}</p>
        <form className="privacy-search" method="get" action="/chest/privacy" role="search">
          <label className="search-field grow">
            <Search />
            <span className="visually-hidden">{t.privacy.search}</span>
            <input className="field" type="search" name="q" defaultValue={q} placeholder={t.privacy.search} minLength={3} required />
          </label>
          <button type="submit" className="button">{t.privacy.find}</button>
        </form>
        {found && (
          <Island id={`erase-${q.length}`} name="EraseForm" props={{
            rows: found.map(f => ({ id: f.id, form: f.formTitle, when: f.createdAt ? when(f.createdAt, lang, zone) : "", who: f.respondent ? nameOf(who.get(f.respondent), lang) : (f.email ?? "") })),
            locale: lang,
            t: { p: t.privacy, table: t.kit.table },
          }} />
        )}
      </div>
    ),
  };
}
