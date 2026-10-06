import { Island, type PageContext, type View } from "@argentic/chest-app";
import { format, formatDate, localeOf, plural } from "../i18n/index.ts";
import { db } from "../lib/db.ts";
import { status } from "../lib/intune.ts";

// Import (managers): Snipe-IT's files, any spreadsheet, and Microsoft
// Intune's devices when an administrator connected it.
export async function importPage({ member, locale: language, t, f }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const intune = await status(db(), member);
  const zone = f.timeZone;
  const when = (at: string) => formatDate(at, locale, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }, zone);
  const last = intune.last?.outcome === "ok" ? plural(t.importer.intuneLast, intune.last.devices ?? 0, locale, { date: when(intune.last.at) })
    : intune.lastGood ? format(t.importer.intuneLastGood, { date: when(intune.lastGood) }) : null;
  const failed = intune.last && intune.last.outcome !== "ok" ? format(t.importer.intuneFailed, { date: when(intune.last.at), why: t.importer.intuneWhy[intune.last.outcome as keyof typeof t.importer.intuneWhy] ?? "" }) : null;
  return { title: t.importer.title, body: (
    <div className="narrow">
      <h1 className="page-title">{t.importer.title}</h1>
      <p className="muted lead">{t.importer.intro}</p>
      <Island id="i-importer" name="Importer" props={{ t: { importer: t.importer, status: t.status, categories: t.categories, files: t.files, table: t.table }, locale,
        intune: { connected: intune.connected, last, lastFailed: failed } }} />
    </div>
  ) };
}
