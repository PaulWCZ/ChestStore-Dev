import { Download } from "../../../../components/icons.tsx";
import { can } from "../../../../lib/access.ts";
import { context } from "../../../../lib/context.ts";

// The admin's downloads: a period, two files.
export default async function Export({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const c = await context(await searchParams);
  if (!c || !can(c.member, "export")) return null;
  const { t } = c;
  const first = c.today.slice(0, 8) + "01";
  return (
    <form className="panel stack" method="get" action="/chest/export">
      <p>{t.export.body}</p>
      <div className="form-grid">
        <label className="span-2">
          <span className="label">{t.export.from}</span>
          <input className="field" type="date" name="from" defaultValue={first} required />
        </label>
        <label className="span-2">
          <span className="label">{t.export.to}</span>
          <input className="field" type="date" name="to" defaultValue={c.today} required />
        </label>
      </div>
      <div className="row">
        <button type="submit" className="button" name="kind" value="bookings"><Download />{t.export.bookings}</button>
        <button type="submit" className="button quiet" name="kind" value="occupancy"><Download />{t.export.occupancy}</button>
      </div>
    </form>
  );
}
