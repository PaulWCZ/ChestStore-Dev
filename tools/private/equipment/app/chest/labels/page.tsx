import * as chest from "@argentic/chest-sdk/chest";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Back } from "../../../components/icons.tsx";
import { LabelFace } from "../../../components/label-face.tsx";
import { PrintButton } from "../../../components/print-button.tsx";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { format, plural } from "../../../lib/i18n/index.ts";
import { listItems, sorts } from "../../../lib/items.ts";
import { limits } from "../../../lib/model.ts";
import { teamOrigin } from "../../../lib/origin.ts";
import { viewer } from "../../../lib/session.ts";

const perSheet = 21;

// Sheets of labels to print on A4 (3 × 7, 63.5 × 38.1 mm — the common
// sticker sheets): the items picked (?ids=), or those a filter of the list
// shows. Each QR code opens the item's page in the Chest; the page still
// asks who is signed in, so a label grants nothing.
export default async function Labels({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "items.manage")) notFound();
  const params = await searchParams;
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const ids = one("ids") ? one("ids").split(",").filter(x => /^[1-9][0-9]{0,17}$/u.test(x)) : undefined;
  const any = ids !== undefined || ["all", "q", "category", "status", "holder"].some(k => one(k) !== "");
  const items = any ? await listItems(db(), member, { ids, q: one("q"), category: one("category"), status: one("status"), holder: one("holder"), sort: sorts.includes(one("sort") as never) ? one("sort") : "tag" }, limits.labels + 1) : [];
  const shown = items.slice(0, limits.labels);
  const capped = items.length > limits.labels;
  const origin = teamOrigin(await headers());
  const company = chest.company();
  const sheets: (typeof shown)[] = [];
  for (let i = 0; i < shown.length; i += perSheet) sheets.push(shown.slice(i, i + perSheet));
  return (
    <main className="labels-page">
      <div className="labels-bar no-print">
        <Link className="back" href="/chest/items"><Back />{t.labels.back}</Link>
        <div className="page-head">
          <div>
            <h1>{t.labels.title}</h1>
            <p className="muted">{t.labels.intro}</p>
          </div>
          {shown.length > 0 && <div className="actions"><span className="muted">{plural(t.labels.count, shown.length, locale)}</span><PrintButton label={t.labels.print} /></div>}
        </div>
        {capped && <p className="notice">{format(t.labels.capped, { count: limits.labels })}</p>}
        {shown.length === 0 && <div className="empty"><p>{t.labels.empty}</p><Link className="button quiet" href="/chest/items">{t.labels.back}</Link></div>}
      </div>
      {sheets.map((sheet, n) => (
        <section key={n} className="sheet" aria-label={`${t.labels.title} ${n + 1}`}>
          {sheet.map(item => (
            <div key={item.id} className="sticker">
              <LabelFace url={`${origin}/chest/items/${item.id}`} tag={item.tag} name={item.name} company={company} scan={t.labels.scan} qrLabel={item.tag} />
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
