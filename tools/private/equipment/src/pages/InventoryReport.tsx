import { chest } from "@argentic/chest-sdk/chest";
import { AppError, Island, notFound, type PageContext, type View } from "@argentic/chest-app";
import { ItemLine } from "../components/bits.tsx";
import { Back } from "../components/icons.tsx";
import { format, formatDate, localeOf, plural } from "../i18n/index.ts";
import { db } from "../lib/db.ts";
import { report } from "../lib/inventory.ts";
import { people } from "../lib/people.ts";
import { holderIds, rowOf } from "../lib/view.ts";

// A closed inventory: what it missed (as those items are now: someone may
// have found one since). Printable.
export async function inventoryReportPage({ member, locale: language, t, f, param }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const found = await report(db(), member, param("id")).catch((error: unknown) => {
    if (error instanceof AppError) notFound();
    throw error;
  });
  const names = await people(holderIds(found.missing));
  const today = chest.today();
  const date = formatDate(found.inventory.closedAt!, locale, { day: "numeric", month: "long", year: "numeric" }, f.timeZone);
  const title = format(t.inventory.reportTitle, { date });
  const missing = (found.inventory.total ?? 0) - (found.inventory.seen ?? 0);
  return { title, body: (
    <div className="wide">
      <a className="back no-print" href="/chest/inventory"><Back />{t.inventory.back}</a>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          <p className="muted">{format(t.inventory.progress, { seen: found.inventory.seen ?? 0, total: found.inventory.total ?? 0 })} · {plural(t.inventory.missingCount, missing, locale)}</p>
        </div>
        <div className="actions no-print"><Island name="PrintButton" props={{ label: t.common.print }} /></div>
      </div>
      <h2 className="section-title">{t.inventory.missing}</h2>
      {found.missing.length === 0 ? <p className="all-clear"><span aria-hidden="true">✓</span> {t.inventory.nothingMissing}</p> : (
        <>
          {found.missing.length < found.count && <p className="small muted">{format(t.inventory.missingShown, { shown: found.missing.length, count: found.count })}</p>}
          <ul className="lines">{found.missing.map(i => <ItemLine key={i.id} row={rowOf(i, names, t, locale, today, member.id)} />)}</ul>
        </>
      )}
    </div>
  ) };
}
