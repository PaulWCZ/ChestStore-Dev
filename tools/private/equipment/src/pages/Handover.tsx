import { chest } from "@argentic/chest-sdk/chest";
import { AppError, notFound, type PageContext, type View } from "@argentic/chest-app";
import { format, formatDate, formatDay, localeOf } from "../i18n/index.ts";
import { can } from "../lib/access.ts";
import { db } from "../lib/db.ts";
import { people, plainName } from "../lib/people.ts";
import { handoverSheet, leftOnOf } from "../lib/receipts.ts";
import { memberPattern } from "../shared/model.ts";
import { charterText, fieldName } from "../shared/words.ts";
import { SheetHead, SheetPage, Signatures } from "./sheet.tsx";

// The handover sheet ("fiche de remise de matériel"): what a person holds —
// or the items named (?items=) — with when and by whom each was given, its
// condition, and whether they confirmed receiving it in the tool (and
// when); the rules they accepted; two signature boxes. For the managers,
// and for the person themself.
export async function handoverPage({ member, locale: language, t, f, param, query }: PageContext): Promise<View> {
  const locale = localeOf(language);
  const id = param("id");
  if (!memberPattern.test(id)) notFound();
  const only = query("items");
  const ids = typeof only === "string" && only ? only.split(",").filter(x => /^[1-9][0-9]{0,17}$/u.test(x)) : undefined;
  const sheet = await handoverSheet(db(), member, id, ids).catch((error: unknown) => {
    if (error instanceof AppError) notFound();
    throw error;
  });
  const names = await people([id, ...sheet.lines.flatMap(l => (l.givenBy ? [l.givenBy] : []))]);
  // A sheet is kept as proof: the name alone, the day they left apart.
  const person = plainName(names.get(id), locale);
  const gone = await leftOnOf(db(), member, id);
  const zone = f.timeZone;
  const day = (d: string | null) => (d ? formatDay(d, locale, { day: "numeric", month: "short", year: "numeric" }) : t.common.none);
  const s = t.sheet;
  const back = can(member, "items.manage") && member.id !== id ? `/chest/people/${id}` : "/chest/mine";
  return { title: s.handoverTitle, body: (
    <SheetPage title={s.handoverTitle} back={back} backLabel={s.back} t={s}>
      <SheetHead title={s.handoverTitle} company={chest.organization.name} person={person} leftOn={gone ? formatDate(gone, locale, { day: "numeric", month: "long", year: "numeric" }, zone) : null} printed={formatDate(new Date(), locale, { day: "numeric", month: "long", year: "numeric" }, zone)} t={s} />
      {sheet.lines.length === 0 && sheet.licences.length === 0 ? <p>{s.nothing}</p> : (
        <table className="paper-table">
          <thead>
            <tr><th scope="col">{s.tag}</th><th scope="col">{s.item}</th><th scope="col">{s.serial}</th><th scope="col">{s.given}</th><th scope="col">{s.condition}</th><th scope="col">{s.receipt}</th></tr>
          </thead>
          <tbody>
            {sheet.lines.map(l => (
              <tr key={l.item.id}>
                <td className="mono nowrap">{l.item.tag}</td>
                <td>{l.item.name}</td>
                <td>
                  {l.item.serial && <span className="mono block">{l.item.serial}</span>}
                  {l.fields.map(f => <span key={f.name} className="block small">{format(s.field, { name: fieldName(f, t), value: f.value })}</span>)}
                </td>
                <td>{day(l.givenOn)}{l.givenBy && l.givenBy.startsWith("mbr_") && <span className="block small muted">{plainName(names.get(l.givenBy), locale)}</span>}</td>
                <td>{l.condition ?? t.common.none}</td>
                <td>
                  {l.confirmedAt ? format(s.confirmedOn, { date: formatDate(l.confirmedAt, locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }, zone) }) : s.notConfirmed}
                  {l.remark && <span className="block small">{format(s.remark, { text: l.remark })}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {sheet.licences.length > 0 && <p className="small">{format(s.licences, { names: sheet.licences.join(", ") })}</p>}
      {sheet.charter && (
        <section className="paper-rules" aria-labelledby="sheet-rules">
          <h3 id="sheet-rules">{s.rules}</h3>
          <p>{charterText(sheet.charter, t)}</p>
        </section>
      )}
      <p className="paper-statement">{s.statementHandover}</p>
      <Signatures t={s} />
    </SheetPage>
  ) };
}
