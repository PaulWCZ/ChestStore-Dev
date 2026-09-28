import Link from "next/link";
import { notFound } from "next/navigation";
import { Back } from "../../../../components/icons.tsx";
import { can } from "../../../../lib/access.ts";
import { db } from "../../../../lib/db.ts";
import { today } from "../../../../lib/model.ts";
import { types } from "../../../../lib/rules.ts";
import { viewer } from "../../../../lib/session.ts";
import { typeName } from "../../../../lib/type-name.ts";
import { Importer } from "./importer.tsx";

// Opening balances from a spreadsheet: HR pastes or picks a CSV, sees what
// is recognised, then sets the balances in one go.
export default async function ImportPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  if (!can(member, "people.all")) notFound();
  const counted = (await types(db())).filter(ty => ty.balance);
  const header = [t.import.name, ...counted.map(ty => typeName(ty, t.types))];
  const example = [header.join(";"), ["Camille Martin", ...counted.map((_, i) => (i === 0 ? "12,5" : "3"))].join(";")].join("\n");
  return (
    <main className="page narrow">
      <Link className="back" href="/chest/people"><Back />{t.team.back}</Link>
      <h1>{t.import.title}</h1>
      <p className="lead">{t.import.intro}</p>
      <Importer example={example} today={today()} typeNames={Object.fromEntries(counted.map(ty => [ty.id, typeName(ty, t.types)]))} t={{ import: t.import, errors: t.errors, team: t.team }} />
    </main>
  );
}
