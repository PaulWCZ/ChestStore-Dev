import { Island, type PageContext, type View } from "@argentic/chest-app";
import { Back, Lock } from "../components/icons.tsx";
import { MapEmpty } from "../components/map-empty.tsx";
import { localeOf } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { context } from "../lib/page-data.ts";
import { everyone } from "../lib/people.ts";

// Importing objectives and key results from a spreadsheet (admins): a
// file, which column is which, who is who, what will be added, then one
// click — and Undo.
export async function importPage({ member, t, locale: language, query }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const sql = db();
  const ctx = await context(sql, member);
  const open = ctx.cycles.filter(c => !c.closed);
  const cycle = open.find(c => c.id === query("cycle")) ?? open.find(c => c.current) ?? open[0];
  const head = (
    <>
      <a className="link-button" href="/chest/company"><Back />{t.company.title}</a>
      <div className="head"><div className="titles"><h1>{t.import.title}</h1><p className="hint">{t.import.intro}</p></div></div>
    </>
  );
  if (!can(member, "any.write") || !cycle) {
    return {
      title: t.import.title,
      body: (
        <div className="narrow">
          {head}
          <MapEmpty icon={<Lock />} title={!cycle ? t.import.noCycle : t.import.onlyAdmins} action={!cycle && can(member, "cycles.manage") ? <a className="button" href="/chest/cycles">{t.shell.cycles}</a> : null} />
        </div>
      ),
    };
  }
  return {
    title: t.import.title,
    body: (
      <div className="narrow">
        {head}
        <Island id="island-import" name="ImportView" props={{
          cycles: open.map(c => ({ id: c.id, name: c.name })),
          cycleId: cycle.id,
          people: await everyone(),
          locale,
          t: { import: t.import, errors: t.errors, levels: t.levels, objective: t.objective, kinds: t.kinds, files: t.files, peoplePicker: t.peoplePicker },
        }} />
      </div>
    ),
  };
}
