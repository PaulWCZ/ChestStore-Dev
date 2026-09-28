import * as chest from "@argentic/chest-sdk/chest";
import { Back, Search } from "../../../../components/icons.tsx";
import { can } from "../../../../lib/access.ts";
import { findPerson, type Found } from "../../../../lib/answers.ts";
import { AppError } from "../../../../lib/app-error.ts";
import { db } from "../../../../lib/db.ts";
import { formatDate } from "../../../../lib/i18n/index.ts";
import { nameOf, people } from "../../../../lib/people.ts";
import { viewer } from "../../../../lib/session.ts";
import { EraseForm } from "./erase-form.tsx";
import * as members from "@argentic/chest-sdk/members";
import { ChestError } from "@argentic/chest-sdk/errors";

// A person asks for their answers to be deleted (GDPR): a manager finds
// them by email address or name and erases them, files included.
export default async function PrivacyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { t, locale, member } = v;
  if (!can(member, "privacy.erase")) return <div className="narrow"><div className="empty"><p>{t.privacy.forbidden}</p></div></div>;
  const raw = (await searchParams)["q"];
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
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
      const byText = await findPerson(db(), member, q);
      const byMember = (await Promise.all(ids.map(id => findPerson(db(), member, id)))).flat();
      const seen = new Set<string>();
      found = [...byText, ...byMember].filter(f => (seen.has(f.id) ? false : (seen.add(f.id), true)));
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      found = [];
    }
  }
  const who = await people((found ?? []).flatMap(f => (f.respondent ? [f.respondent] : [])));
  const zone = chest.timeZone();
  return (
    <div className="narrow">
      <a className="back-link" href="/chest"><Back />{t.shell.home}</a>
      <h1 className="page-title">{t.privacy.title}</h1>
      <p className="lede">{t.privacy.lede}</p>
      <form className="privacy-search" method="get" role="search">
        <label className="search-field grow">
          <Search />
          <span className="visually-hidden">{t.privacy.search}</span>
          <input className="field" type="search" name="q" defaultValue={q} placeholder={t.privacy.search} minLength={3} required />
        </label>
        <button type="submit" className="button">{t.privacy.find}</button>
      </form>
      {found && (
        <EraseForm
          rows={found.map(f => ({ id: f.id, form: f.formTitle, when: f.createdAt ? formatDate(f.createdAt, locale, zone, { dateStyle: "medium", timeStyle: "short" }) : "", who: f.respondent ? nameOf(who.get(f.respondent), locale) : (f.email ?? "") }))}
          locale={locale}
          t={{ p: t.privacy, errors: t.errors }}
        />
      )}
    </div>
  );
}
