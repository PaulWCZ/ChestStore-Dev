import type { Catalogue, Locale } from "../i18n/index.ts";
import { format, formatDay, plural } from "../i18n/index.ts";
import type { BriefItem, Item } from "./items.ts";
import { daysBetween, ending, type IconName, type Status } from "../shared/model.ts";
import { nameOf, type Person } from "./people.ts";
import { categoryName } from "../shared/words.ts";

// What a list row or a card shows of an item, already in words: the pages
// build it on the server (names from the Chest, dates in the reader's
// language) and hand plain data to the views.
export type Holder =
  | { kind: "member"; id: string; name: string; photo: string | null; gone: boolean; you: boolean }
  | { kind: "place"; name: string }
  | { kind: "seats"; used: number; seats: number }
  | { kind: "stock"; count: number; low: boolean }
  // Held by someone a member may not see (keys and badges, vehicles).
  | { kind: "hidden" }
  | { kind: "none" };

export type Row = {
  id: string;
  tag: string;
  name: string;
  category: string;
  icon: IconName;
  status: Status;
  statusText: string;
  serial: string | null;
  holder: Holder;
  holderText: string;
  since: string | null;
  ending: { text: string; when: string; state: "soon" | "past" } | null;
  photo: boolean;
  problems: number;
  problemsLabel: string;
  // Things counted in bulk at or under their minimum.
  low: boolean;
  lowLabel: string;
};

export type Names = Map<string, Person>;

export function holderOf(item: BriefItem, names: Names, t: Catalogue, locale: Locale, me: string): { holder: Holder; text: string } {
  if (item.seats !== null) return { holder: { kind: "seats", used: item.seatsUsed, seats: item.seats }, text: format(t.list.seatsUsed, { used: item.seatsUsed, seats: item.seats }) };
  if (item.quantity !== null && item.category.kind === "consumable") {
    return { holder: { kind: "stock", count: item.quantity, low: isLow(item) }, text: plural(t.list.units, item.quantity, locale) };
  }
  if (item.holderHidden) return { holder: { kind: "hidden" }, text: t.list.heldHidden };
  if (item.holder) {
    const person = names.get(item.holder);
    const you = item.holder === me;
    const name = you ? t.people.you : item.holder === "erased" ? t.people.erased : nameOf(person, locale);
    return { holder: { kind: "member", id: item.holder, name, photo: person?.photo ?? null, gone: item.holder === "erased" || (person?.status ?? "unknown") !== "member", you }, text: name };
  }
  if (item.place) return { holder: { kind: "place", name: item.place }, text: item.place };
  return { holder: { kind: "none" }, text: item.status === "in_stock" ? t.list.inStock : t.common.none };
}

// The warranty or renewal a manager should look at: the nearest one that
// ends within 60 days or ended in the last 30.
export function endingOf(item: Pick<Item, "warrantyUntil" | "renewsOn" | "status">, t: Catalogue, locale: Locale, today: string): Row["ending"] {
  if (item.status === "retired" || item.status === "lost") return null;
  const candidates: { day: string; kind: "warranty" | "renewal" }[] = [];
  if (item.warrantyUntil) candidates.push({ day: item.warrantyUntil, kind: "warranty" });
  if (item.renewsOn) candidates.push({ day: item.renewsOn, kind: "renewal" });
  const relevant = candidates
    .map(c => ({ ...c, days: daysBetween(today, c.day), state: ending(c.day, today) }))
    .filter(c => c.state === "soon" || (c.state === "past" && c.days >= -30))
    .sort((a, b) => a.day.localeCompare(b.day));
  const c = relevant[0];
  if (!c) return null;
  const date = formatDay(c.day, locale, { day: "numeric", month: "short", year: "numeric" });
  const past = c.state === "past";
  const text = format(c.kind === "warranty" ? (past ? t.ending.warrantyEnded : t.ending.warranty) : (past ? t.ending.renewalPassed : t.ending.renewal), { date });
  const when = past ? plural(t.ending.agoDays, -c.days, locale) : plural(t.ending.inDays, c.days, locale);
  return { text, when, state: past ? "past" : "soon" };
}

export const isLow = (item: Pick<BriefItem, "quantity" | "status"> & { minQuantity?: number | null }): boolean =>
  item.status !== "retired" && item.quantity !== null && item.minQuantity !== null && item.minQuantity !== undefined && item.quantity <= item.minQuantity;

export function rowOf(item: BriefItem & Partial<Pick<Item, "openProblems">>, names: Names, t: Catalogue, locale: Locale, today: string, me: string): Row {
  const { holder, text } = holderOf(item, names, t, locale, me);
  return {
    id: item.id,
    tag: item.tag,
    name: item.name,
    category: categoryName(item.category, t),
    icon: item.category.icon,
    status: item.status,
    statusText: t.status[item.status],
    serial: item.serial,
    holder,
    holderText: text,
    since: item.heldSince ? format(t.mine.since, { date: formatDay(item.heldSince, locale) }) : null,
    ending: endingOf(item as Item, t, locale, today),
    photo: item.photo !== null,
    problems: item.openProblems ?? 0,
    problemsLabel: t.item.problems,
    low: isLow(item),
    lowLabel: t.list.low,
  };
}

// The member ids a list of items names (holders), to ask the Chest once.
export function holderIds(items: BriefItem[]): string[] {
  return [...new Set(items.flatMap(i => (i.holder ? [i.holder] : [])))];
}
