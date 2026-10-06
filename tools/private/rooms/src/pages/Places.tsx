import { forbidden, Island, type PageContext, type View } from "@argentic/chest-app";
import { PageHeader, Tabs } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { Download } from "../components/icons.tsx";
import { can } from "../lib/access.ts";
import { context, type Context } from "../lib/context.ts";
import { directory } from "../lib/directory.ts";
import { weekdayLoad } from "../lib/export.ts";
import { chestGroups } from "../lib/groups.ts";
import { addDays } from "../shared/model.ts";
import { nameOf, people } from "../lib/people.ts";
import { format, formatDay, plural, type Catalogue } from "../i18n/index.ts";

// The admins' part: offices, rules, export — three tabs (links: the
// address keeps the page). Anyone else gets the forbidden page.
type Tab = "places" | "rules" | "export";
function frame(t: Catalogue, current: Tab, children: ReactNode): ReactNode {
  return (
    <div className="narrow">
      <PageHeader title={t.places.title} />
      <Tabs label={t.places.title} current={current}
        items={[
          { id: "places", label: t.places.tabs.places, href: "/chest/places" },
          { id: "rules", label: t.places.tabs.rules, href: "/chest/places/rules" },
          { id: "export", label: t.places.tabs.export, href: "/chest/places/export" },
        ]} />
      <div className="places-body">{children}</div>
    </div>
  );
}
async function admin(p: PageContext, ability: "places.manage" | "rules.manage" | "export"): Promise<Context | null> {
  const c = await context(p, p.query("office"));
  if (c && !can(c.member, ability)) forbidden();
  return c;
}

// The offices as an admin builds them: floors, meeting rooms, desk areas
// and desks, each changed in place.
export async function placesPage(p: PageContext): Promise<View> {
  const c = await admin(p, "places.manage");
  if (!c) return { title: p.t.noAccess.title, body: null };
  const { locale, t, office } = c;
  const [everyone, groups] = await Promise.all([directory(), chestGroups()]);
  const assigned = c.offices.flatMap(o => o.floors.flatMap(f => f.areas.flatMap(a => a.desks.flatMap(d => (d.assignedTo ? [d.assignedTo] : [])))));
  const who = await people(assigned);
  const names: Record<string, string> = Object.fromEntries(assigned.map(id => [id, nameOf(who.get(id), locale)]));
  for (const x of everyone) names[x.id] ??= x.name;
  return {
    title: t.places.title,
    body: frame(t, "places", (
      <Island name="PlacesView" id={"places-" + (office?.id ?? "none")} props={{
        offices: c.offices.map(o => ({ id: o.id, name: o.name, address: o.address })),
        office,
        people: everyone.map(x => ({ id: x.id, name: x.name, photo: x.photo })),
        groups,
        names,
        locale,
        t: {
          places: t.places, equipment: t.equipment, features: t.features, featuresShort: t.featuresShort, rooms: t.rooms, booking: t.booking, dialog: t.kit.dialog, peoplePicker: t.kit.peoplePicker,
          errors: { file_too_large: t.errors.file_too_large, unavailable: t.errors.unavailable, unknown: t.errors.unknown, file_missing: t.errors.file_missing, invalid: t.errors.invalid },
        },
      }} />
    )),
  };
}

// The rules of the office.
export async function rulesPage(p: PageContext): Promise<View> {
  const c = await admin(p, "rules.manage");
  if (!c) return { title: p.t.noAccess.title, body: null };
  return { title: c.t.places.tabs.rules, body: frame(c.t, "rules", <Island name="RulesForm" props={{ rules: c.rules, locale: c.locale, t: { rules: c.t.rules } }} />) };
}

// How full the office is (each working day of the week, the last eight
// weeks, counts only: a bar per day, drawn as an SVG — no style attribute
// in a page), and the downloads: a period, two files.
export async function exportPage(p: PageContext): Promise<View> {
  const c = await admin(p, "export");
  if (!c) return { title: p.t.noAccess.title, body: null };
  const { t, locale, office } = c;
  const first = c.today.slice(0, 8) + "01";
  const load = office ? await weekdayLoad(c.sql, c.member, office.id, c.zone) : null;
  const rows = (load?.loads ?? []).filter(l => c.rules.weekdays.includes(l.weekday));
  const top = Math.max(1, load?.desks ?? 0, ...rows.map(r => r.people));
  // One decimal at most ("1.5 people"); the plural follows the number as
  // written (French: "0,5 personne", "1,5 personne", "2 personnes").
  const tenth = (n: number) => Math.round(n * 10) / 10;
  return {
    title: t.places.tabs.export,
    body: frame(t, "export", (
      <div className="stack-l">
        {office && load && (
          <section className="panel" aria-labelledby="load-title">
            <h2 id="load-title" className="annotation">{format(t.export.load.title, { office: office.name })}</h2>
            {load.since === null ? <p className="hint">{t.export.load.empty}</p> : (
              <table className="load">
                <caption className="visually-hidden">{format(t.export.load.title, { office: office.name })}</caption>
                <thead className="visually-hidden">
                  <tr><th scope="col">{t.export.load.day}</th><th scope="col">{t.export.load.people}</th><th scope="col">{t.export.load.desks}</th></tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.weekday}>
                      <th scope="row">{formatDay(addDays("2024-01-01", r.weekday - 1), locale, { weekday: "long" })}</th>
                      {r.days === 0 ? (
                        <td className="load-bar" colSpan={2}><span className="load-value muted">{t.export.load.notYet}</span></td>
                      ) : (
                        <>
                          <td className="load-bar">
                            <svg className="bar" viewBox="0 0 100 18" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect width={Math.max(1, (100 * r.people) / top)} height="18" rx="2" /></svg>
                            <span className="load-value">{plural(t.export.load.peopleValue, tenth(r.people), locale)}</span>
                          </td>
                          <td className="load-desks">{load.desks > 0 ? plural(t.export.load.desksValue, tenth(r.desks), locale, { total: load.desks }) : ""}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="hint">{load.since === null ? t.export.load.noteEmpty : format(t.export.load.note, { date: formatDay(load.since, locale, { day: "numeric", month: "long" }) })}</p>
          </section>
        )}
        <form className="panel stack" method="get" action="/chest/export">
          <p>{t.export.body}</p>
          <Island name="Period" props={{ first, today: c.today, label: t.export.period, labels: t.kit.date, lang: c.locale }} />
          <div className="row">
            <button type="submit" className="button" name="kind" value="bookings"><Download />{t.export.bookings}</button>
            <button type="submit" className="button quiet" name="kind" value="occupancy"><Download />{t.export.occupancy}</button>
          </div>
        </form>
      </div>
    )),
  };
}
