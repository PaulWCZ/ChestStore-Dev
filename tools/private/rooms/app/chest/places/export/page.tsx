import { Download } from "../../../../components/icons.tsx";
import { can } from "../../../../lib/access.ts";
import { context } from "../../../../lib/context.ts";
import { weekdayLoad } from "../../../../lib/export.ts";
import { format, formatDay } from "../../../../lib/i18n/index.ts";
import { addDays } from "../../../../lib/model.ts";
import { Period } from "./period.tsx";

// The admin's view of how full the office is (each working day of the
// week, the last eight weeks, counts only), and the downloads: a period,
// two files.
export default async function Export({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const c = await context(await searchParams);
  if (!c || !can(c.member, "export")) return null;
  const { t, locale, office } = c;
  const first = c.today.slice(0, 8) + "01";
  const load = office ? await weekdayLoad(c.sql, c.member, office.id, c.zone) : null;
  const rows = (load?.loads ?? []).filter(l => c.rules.weekdays.includes(l.weekday));
  const top = Math.max(1, load?.desks ?? 0, ...rows.map(r => r.people));
  const one = (n: number) => new Intl.NumberFormat(locale === "en" ? "en-GB" : locale, { maximumFractionDigits: 1 }).format(n);
  return (
    <div className="stack-l">
      {office && load && (
        <section className="panel" aria-labelledby="load-title">
          <h2 id="load-title" className="annotation">{format(t.export.load.title, { office: office.name })}</h2>
          {rows.every(r => r.people === 0) ? <p className="hint">{t.export.load.empty}</p> : (
            <table className="load">
              <caption className="visually-hidden">{format(t.export.load.title, { office: office.name })}</caption>
              <thead className="visually-hidden">
                <tr><th scope="col">{t.export.load.day}</th><th scope="col">{t.export.load.people}</th><th scope="col">{t.export.load.desks}</th></tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.weekday}>
                    <th scope="row">{formatDay(addDays("2024-01-01", r.weekday - 1), locale, { weekday: "long" })}</th>
                    <td className="load-bar">
                      <span className="bar" style={{ width: `${(100 * r.people) / top}%` }} />
                      <span className="load-value">{format(t.export.load.peopleValue, { count: one(r.people) })}</span>
                    </td>
                    <td className="load-desks">{load.desks > 0 ? format(t.export.load.desksValue, { count: one(r.desks), total: load.desks }) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="hint">{t.export.load.note}</p>
        </section>
      )}
      <form className="panel stack" method="get" action="/chest/export">
        <p>{t.export.body}</p>
        <Period first={first} today={c.today} label={t.export.period} labels={t.date} lang={c.locale} />
        <div className="row">
          <button type="submit" className="button" name="kind" value="bookings"><Download />{t.export.bookings}</button>
          <button type="submit" className="button quiet" name="kind" value="occupancy"><Download />{t.export.occupancy}</button>
        </div>
      </form>
    </div>
  );
}
