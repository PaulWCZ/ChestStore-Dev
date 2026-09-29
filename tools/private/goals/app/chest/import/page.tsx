import Link from "next/link";
import { Back, Lock } from "../../../components/icons.tsx";
import { MapEmpty } from "../../../components/map-empty.tsx";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { context } from "../../../lib/page-data.ts";
import { everyone } from "../../../lib/people.ts";
import { viewer } from "../../../lib/session.ts";
import { ImportView } from "./import-view.tsx";

// Importing objectives and key results from a spreadsheet (admins): a
// file, which column is which, who is who, what will be added, then one
// click — and Undo.
export default async function ImportPage({ searchParams }: { searchParams: Promise<{ cycle?: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const sql = db();
  const ctx = await context(sql, member);
  const open = ctx.cycles.filter(c => !c.closed);
  const asked = (await searchParams).cycle;
  const cycle = open.find(c => c.id === asked) ?? open.find(c => c.current) ?? open[0];
  const head = (
    <>
      <Link className="link-button" href="/chest/company"><Back />{t.company.title}</Link>
      <div className="head"><div className="titles"><h1>{t.import.title}</h1><p className="hint">{t.import.intro}</p></div></div>
    </>
  );
  if (!can(member, "any.write") || !cycle) {
    return (
      <div className="narrow">
        {head}
        <MapEmpty icon={<Lock />} title={!cycle ? t.import.noCycle : t.import.onlyAdmins} action={!cycle && can(member, "cycles.manage") ? <Link className="button" href="/chest/cycles">{t.shell.cycles}</Link> : null} />
      </div>
    );
  }
  const people = await everyone();
  return (
    <div className="narrow">
      {head}
      <ImportView
        cycles={open.map(c => ({ id: c.id, name: c.name }))}
        cycleId={cycle.id}
        people={people}
        locale={locale}
        t={{ import: t.import, errors: t.errors, levels: t.levels, objective: t.objective, kinds: t.kinds, files: t.files, peoplePicker: t.peoplePicker }}
      />
    </div>
  );
}
