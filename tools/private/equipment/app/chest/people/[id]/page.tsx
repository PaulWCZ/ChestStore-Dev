import * as chest from "@argentic/chest-sdk/chest";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "../../../../components/avatar.tsx";
import { Back } from "../../../../components/icons.tsx";
import { can } from "../../../../lib/access.ts";
import { AppError } from "../../../../lib/app-error.ts";
import { db } from "../../../../lib/db.ts";
import { plural } from "../../../../lib/i18n/index.ts";
import { holdings, listItems } from "../../../../lib/items.ts";
import { memberPattern } from "../../../../lib/model.ts";
import { nameOf, people } from "../../../../lib/people.ts";
import { viewer } from "../../../../lib/session.ts";
import { rowOf } from "../../../../lib/view.ts";
import { PersonView } from "./person-view.tsx";

// Everything one person holds (managers): the checklist of the day they
// leave, with "Take everything back"; and "Give something" from the stock.
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "items.manage")) notFound();
  const id = (await params).id;
  if (id !== "erased" && !memberPattern.test(id)) notFound();
  const sql = db();
  const held = await holdings(sql, member, id).catch(error => {
    if (error instanceof AppError) notFound();
    throw error;
  });
  const person = (await people([id])).get(id);
  const present = person?.status === "member";
  if (!present && held.items.length === 0 && held.seats.length === 0 && id !== "erased" && person?.status === "unknown") notFound();
  const name = id === "erased" ? t.people.erased : nameOf(person, locale);
  const today = chest.today();
  const names = new Map(person ? [[id, person]] : []);
  const rows = held.items.map(i => rowOf(i, names, t, locale, today, member.id));
  const seatRows = held.seats.map(i => rowOf(i, names, t, locale, today, member.id));
  const stock = present ? (await listItems(sql, member, { status: "in_stock" }, 500)).concat((await listItems(sql, member, { status: "in_use" }, 500)).filter(i => i.seats !== null && i.seatsUsed < i.seats)) : [];
  const offer = stock.filter(i => !held.seats.some(s => s.id === i.id)).map(i => rowOf(i, new Map(), t, locale, today, member.id));
  const count = held.items.length + held.seats.length;
  return (
    <main className="wide">
      <Link className="back" href="/chest/people"><Back />{t.peopleList.title}</Link>
      <div className="person-head">
        <Avatar name={name} photo={person?.photo ?? null} size={64} />
        <div>
          <h1>{name}</h1>
          <p className="muted">
            {plural(t.person.holds, held.items.length, locale)}
            {held.seats.length > 0 && <> {plural(t.person.seats, held.seats.length, locale)}</>}
          </p>
        </div>
      </div>
      <PersonView
        holder={id}
        name={name}
        present={present}
        gone={id === "erased" || !present}
        items={rows}
        seats={seatRows}
        offer={offer}
        count={count}
        t={{ person: t.person, errors: t.errors, common: t.common, give: t.give, takeBack: t.takeBack, item: t.item, list: t.list }}
        locale={locale}
      />
    </main>
  );
}
