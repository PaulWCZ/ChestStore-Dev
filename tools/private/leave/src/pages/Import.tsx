import { Island, notFound, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { Tabs } from "@argentic/chest-ui/components";
import { Back } from "../components/icons.tsx";
import { can } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { leaveFields, personFields } from "../lib/import.ts";
import { today } from "../lib/today.ts";
import { types } from "../lib/rules.ts";
import { typeName } from "../shared/type-name.ts";

// Switching from another tool: HR pastes or picks a CSV, sees what is
// recognised (and says what an unknown column is), then applies it in one
// go. Two files: people and balances (start dates, employee numbers,
// balances — paid leave as acquired and being earned), then the leave
// already approved there (Christmas booked in Lucca).
export async function importPage({ member, locale, t, query }: PageContext<MemberContext>): Promise<View> {
  if (!can(member, "people.all")) return notFound();
  const leave = query("what") === "leave";
  const all = await types(db());
  const counted = all.filter(ty => ty.balance);
  const paid = counted.find(ty => ty.period === "acquired");
  const name = (ty: (typeof all)[number]) => typeName(ty, t.types);
  // The example: the columns of a Lucca export, in the reader's language.
  const example = leave
    ? [[t.import.lastName, t.import.firstName, t.import.kind, t.import.from, t.import.fromHalf, t.import.to, t.import.toHalf].join(";"),
      ["Martin", "Camille", paid ? name(paid) : name(all[0]!), "21/12/2026", "AM", "31/12/2026", "PM"].join(";")].join("\n")
    : [[t.import.number, t.import.lastName, t.import.firstName, t.import.start, ...counted.flatMap(ty => (ty.period === "acquired" ? [`${name(ty)} N-1`, `${name(ty)} N`] : [name(ty)]))].join(";"),
      ["0042", "Martin", "Camille", "04/03/2019", ...counted.flatMap(ty => (ty.period === "acquired" ? ["12,5", "8,33"] : ["3"]))].join(";")].join("\n");
  // What an unknown column may be.
  const fields = (leave ? leaveFields : personFields).map(f => ({ value: f as string, label: t.import.fields[f as keyof typeof t.import.fields] }));
  if (!leave) for (const ty of counted) {
    if (ty.period === "acquired") fields.push({ value: `b:${ty.id}:acquired`, label: `${name(ty)} · ${t.import.partAcquired}` }, { value: `b:${ty.id}:earning`, label: `${name(ty)} · ${t.import.partEarning}` });
    else fields.push({ value: `b:${ty.id}:total`, label: name(ty) });
  }
  return {
    title: t.import.title,
    body: (
      <div className="page narrow">
        <a className="back" href="/chest/people"><Back />{t.team.back}</a>
        <h1>{t.import.title}</h1>
        <Tabs label={t.import.title} current={leave ? "leave" : "people"} items={[{ id: "people", label: t.import.tabPeople, href: "/chest/people/import" }, { id: "leave", label: t.import.tabLeave, href: "/chest/people/import?what=leave" }]} />
        <p className="lead">{leave ? t.import.introLeave : t.import.intro}</p>
        <Island id={leave ? "import-leave" : "import-people"} name="Importer" props={{
          what: leave ? "leave" : "people",
          example,
          today: today(),
          locale,
          fields,
          kinds: all.map(ty => ({ id: ty.id, name: name(ty) })),
          t: { import: t.import, team: t.team, date: t.kit.date, files: t.kit.files },
        }} />
      </div>
    ),
  };
}
