import { chest } from "@argentic/chest-sdk/chest";
import { forbidden } from "next/navigation";
import { can } from "../../../lib/access.ts";
import { db } from "../../../lib/db.ts";
import { format, formatDate, plural } from "../../../lib/i18n/index.ts";
import { status } from "../../../lib/intune.ts";
import { viewer } from "../../../lib/session.ts";
import { Importer } from "./importer.tsx";

// Import (managers): Snipe-IT's files, any spreadsheet, and Microsoft
// Intune's devices when an administrator connected it.
export default async function ImportPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "items.manage")) forbidden();
  const intune = await status(db(), member);
  const zone = chest.timeZone;
  const when = (at: string) => formatDate(at, locale, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }, zone);
  const last = intune.last?.outcome === "ok" ? plural(t.importer.intuneLast, intune.last.devices ?? 0, locale, { date: when(intune.last.at) })
    : intune.lastGood ? format(t.importer.intuneLastGood, { date: when(intune.lastGood) }) : null;
  const failed = intune.last && intune.last.outcome !== "ok" ? format(t.importer.intuneFailed, { date: when(intune.last.at), why: t.importer.intuneWhy[intune.last.outcome as keyof typeof t.importer.intuneWhy] ?? "" }) : null;
  return (
    <div className="narrow">
      <h1 className="page-title">{t.importer.title}</h1>
      <p className="muted lead">{t.importer.intro}</p>
      <Importer t={{ importer: t.importer, errors: t.errors, status: t.status, categories: t.categories, files: t.files, table: t.table }} locale={locale}
        intune={{ connected: intune.connected, last, lastFailed: failed }} />
    </div>
  );
}
