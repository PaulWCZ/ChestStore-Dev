import { chest } from "@argentic/chest-sdk/chest";
import { AppError, Island, notFound, type PageContext, type View } from "@argentic/chest-app";
import { Avatar } from "@argentic/chest-ui/components";
import { Back } from "../components/icons.tsx";
import { format, formatDay, localeOf, plural } from "../i18n/index.ts";
import { db } from "../lib/db.ts";
import { lastDayOf } from "../lib/departures.ts";
import { holdings, listItems, openReceipts, type Receipt } from "../lib/items.ts";
import { nameOf, people } from "../lib/people.ts";
import { rowOf } from "../lib/view.ts";
import { memberPattern } from "../shared/model.ts";

// Everything one person holds (managers): the checklist of the day they
// leave, with "Take everything back" (and their last day, when People told
// it); and "Give something" from the stock.
export async function personPage({ member, locale: language, t, param }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const id = param("id");
  if (id !== "erased" && !memberPattern.test(id)) notFound();
  const sql = db();
  const held = await holdings(sql, member, id).catch((error: unknown) => {
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
  const offer = stock.filter(i => !held.seats.some(s => s.id === i.id) && i.category.kind !== "consumable").map(i => rowOf(i, new Map(), t, locale, today, member.id));
  // Each thing they hold: received (they confirmed) or to confirm.
  const receipts = id === "erased" ? new Map<string, Receipt>() : await openReceipts(sql, id);
  const receipt = Object.fromEntries(held.items.map(i => [i.id, receipts.get(i.id)?.confirmedAt ? "confirmed" as const : "waiting" as const]));
  const count = held.items.length + held.seats.length;
  const lastDay = present ? await lastDayOf(sql, member, id) : null;
  const leaving = lastDay ? format(t.person.leaving, { date: formatDay(lastDay, locale, { weekday: "long", day: "numeric", month: "long" }) }) : null;
  return { title: name, body: (
    <div className="wide">
      <a className="back" href="/chest/people"><Back />{t.peopleList.title}</a>
      <div className="person-head">
        <Avatar name={name} photo={person?.photo ?? null} size="xl" />
        <div>
          <h1>{name}</h1>
          <p className="muted">
            {plural(t.person.holds, held.items.length, locale)}
            {held.seats.length > 0 && <> {plural(t.person.seats, held.seats.length, locale)}</>}
          </p>
        </div>
      </div>
      <Island id={`person-${id}`} name="PersonView" props={{
        holder: id,
        name,
        present,
        gone: id === "erased" || !present,
        items: rows,
        seats: seatRows,
        offer,
        count,
        leaving,
        receipt,
        sheets: id !== "erased" ? { handover: `/chest/people/${id}/handover`, back: `/chest/people/${id}/return` } : null,
        t: { person: t.person, common: t.common, give: t.give, takeBack: t.takeBack, item: t.item, list: t.list, dialog: t.dialog, search: t.search },
        locale,
      }} />
    </div>
  ) };
}
