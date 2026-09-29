import * as chest from "@argentic/chest-sdk/chest";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { ItemLine } from "../../../../components/bits.tsx";
import { Back } from "../../../../components/icons.tsx";
import { PrintButton } from "../../../../components/print-button.tsx";
import { can } from "../../../../lib/access.ts";
import { AppError } from "../../../../lib/app-error.ts";
import { db } from "../../../../lib/db.ts";
import { format, formatDate, plural } from "../../../../lib/i18n/index.ts";
import { report } from "../../../../lib/inventory.ts";
import { people } from "../../../../lib/people.ts";
import { viewer } from "../../../../lib/session.ts";
import { holderIds, rowOf } from "../../../../lib/view.ts";

// A closed inventory: what it missed (as those items are now: someone may
// have found one since). Printable.
export default async function InventoryReport({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "items.manage")) forbidden();
  const found = await report(db(), member, (await params).id).catch(error => {
    if (error instanceof AppError) notFound();
    throw error;
  });
  const names = await people(holderIds(found.missing));
  const today = chest.today();
  const date = formatDate(found.inventory.closedAt!, locale, { day: "numeric", month: "long", year: "numeric" }, chest.timeZone());
  const missing = (found.inventory.total ?? 0) - (found.inventory.seen ?? 0);
  return (
    <div className="wide">
      <Link className="back no-print" href="/chest/inventory"><Back />{t.inventory.back}</Link>
      <div className="page-head">
        <div>
          <h1>{format(t.inventory.reportTitle, { date })}</h1>
          <p className="muted">{format(t.inventory.progress, { seen: found.inventory.seen ?? 0, total: found.inventory.total ?? 0 })} · {plural(t.inventory.missingCount, missing, locale)}</p>
        </div>
        <div className="actions no-print"><PrintButton label={t.common.print} /></div>
      </div>
      <h2 className="section-title">{t.inventory.missing}</h2>
      {found.missing.length === 0 ? <p className="all-clear"><span aria-hidden="true">✓</span> {t.inventory.nothingMissing}</p> : (
        <ul className="lines">{found.missing.map(i => <ItemLine key={i.id} row={rowOf(i, names, t, locale, today, member.id)} />)}</ul>
      )}
    </div>
  );
}
