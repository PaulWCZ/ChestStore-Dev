import { chest } from "@argentic/chest-sdk/chest";
import { Island, type PageContext, type View } from "@argentic/chest-app";
import { EmptyState } from "@argentic/chest-ui/components";
import { Back } from "../components/icons.tsx";
import { LabelFace } from "../components/label-face.tsx";
import { format, localeOf, plural } from "../i18n/index.ts";
import { db } from "../lib/db.ts";
import { listItems, sorts } from "../lib/items.ts";
import { teamOrigin } from "../lib/origin.ts";
import { limits } from "../shared/model.ts";

const perSheet = 21;

// Sheets of labels to print on A4 (3 × 7, 63.5 × 38.1 mm — the common
// sticker sheets): the items picked (?ids=), or those a filter of the list
// shows. Each QR code opens the item's page in the Chest; the page still
// asks who is signed in, so a label grants nothing.
export async function labelsPage({ member, locale: language, t, query, request }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const one = (k: string) => query(k) ?? "";
  const ids = one("ids") ? one("ids").split(",").filter(x => /^[1-9][0-9]{0,17}$/u.test(x)) : undefined;
  const any = ids !== undefined || ["all", "q", "category", "status", "holder"].some(k => one(k) !== "");
  const items = any ? await listItems(db(), member, { ...(ids ? { ids } : {}), q: one("q"), category: one("category"), status: one("status"), holder: one("holder"), sort: sorts.includes(one("sort") as never) ? one("sort") : "tag" }, limits.labels + 1) : [];
  const shown = items.slice(0, limits.labels);
  const capped = items.length > limits.labels;
  const origin = teamOrigin(request);
  const company = chest.organization.name;
  const sheets: (typeof shown)[] = [];
  for (let i = 0; i < shown.length; i += perSheet) sheets.push(shown.slice(i, i + perSheet));
  return { title: t.labels.title, body: (
    <div className="labels-page">
      <div className="no-print">
        <a className="back" href="/chest/items"><Back />{t.labels.back}</a>
        <div className="page-head">
          <div>
            <h1>{t.labels.title}</h1>
            <p className="muted">{t.labels.intro}</p>
          </div>
          {shown.length > 0 && <div className="actions"><span className="muted">{plural(t.labels.count, shown.length, locale)}</span><Island name="PrintButton" props={{ label: t.labels.print }} /></div>}
        </div>
        {capped && <p className="notice">{format(t.labels.capped, { count: limits.labels })}</p>}
        {shown.length === 0 && <EmptyState title={t.labels.empty} action={<a className="button quiet" href="/chest/items">{t.labels.back}</a>} />}
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
    </div>
  ) };
}
