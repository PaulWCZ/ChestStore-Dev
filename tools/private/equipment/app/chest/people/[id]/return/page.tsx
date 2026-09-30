import { chest } from "@argentic/chest-sdk/chest";
import { forbidden, notFound } from "next/navigation";
import { SheetHead, SheetPage, Signatures } from "../../../../../components/sheet.tsx";
import { AppError } from "../../../../../lib/app-error.ts";
import { can } from "../../../../../lib/access.ts";
import { db } from "../../../../../lib/db.ts";
import { format, formatDate, formatDay } from "../../../../../lib/i18n/index.ts";
import { memberPattern } from "../../../../../lib/model.ts";
import { people, plainName } from "../../../../../lib/people.ts";
import { leftOnOf, returnSheet } from "../../../../../lib/receipts.ts";
import { viewer } from "../../../../../lib/session.ts";
import { fieldName } from "../../../../../lib/words.ts";

// The return sheet ("fiche de restitution"): what came back from a person
// in the last 90 days, on which day, to whom and in what condition — and
// what they still hold, "not returned" on the day it is printed. The proof
// a company keeps when a laptop does not come back. Managers only.
export default async function ReturnSheet({ params }: { params: Promise<{ id: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  if (!can(member, "items.manage")) forbidden();
  const id = (await params).id;
  if (!memberPattern.test(id)) notFound();
  const sheet = await returnSheet(db(), member, id).catch(error => {
    if (error instanceof AppError) notFound();
    throw error;
  });
  const names = await people([id, ...sheet.returned.flatMap(l => (l.returnedTo ? [l.returnedTo] : []))]);
  // A sheet is kept as proof: the name alone, the day they left apart.
  const person = plainName(names.get(id), locale);
  const gone = await leftOnOf(db(), member, id);
  const zone = chest.timeZone;
  const today = chest.today();
  const day = (d: string | null) => (d ? formatDay(d, locale, { day: "numeric", month: "short", year: "numeric" }) : t.common.none);
  const s = t.sheet;
  return (
    <SheetPage title={s.returnTitle} back={`/chest/people/${id}`} backLabel={s.back} t={s}>
      <SheetHead title={s.returnTitle} company={chest.organization.name} person={person} leftOn={gone ? formatDate(gone, locale, { day: "numeric", month: "long", year: "numeric" }, zone) : null} printed={formatDate(new Date(), locale, { day: "numeric", month: "long", year: "numeric" }, zone)} t={s} />
      <h3 className="paper-section">{s.returned}</h3>
      {sheet.returned.length === 0 ? <p>{s.nothingReturned}</p> : (
        <table className="paper-table">
          <thead>
            <tr><th scope="col">{s.tag}</th><th scope="col">{s.item}</th><th scope="col">{s.serial}</th><th scope="col">{s.returnedOn}</th><th scope="col">{s.returnCondition}</th></tr>
          </thead>
          <tbody>
            {sheet.returned.map(l => (
              <tr key={l.item.id}>
                <td className="mono nowrap">{l.item.tag}</td>
                <td>{l.item.name}</td>
                <td>
                  {l.item.serial && <span className="mono block">{l.item.serial}</span>}
                  {l.fields.map(f => <span key={f.name} className="block small">{format(s.field, { name: fieldName(f, t), value: f.value })}</span>)}
                </td>
                <td>{day(l.returnedOn)}{l.returnedTo && l.returnedTo.startsWith("mbr_") && <span className="block small muted">{plainName(names.get(l.returnedTo), locale)}</span>}</td>
                <td>{[l.returnCondition, l.status && l.status !== "in_stock" ? t.status[l.status as keyof typeof t.status] : null].filter(Boolean).join(" · ") || t.common.none}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3 className="paper-section">{s.kept}</h3>
      {sheet.kept.length === 0 ? <p>{s.nothingKept}</p> : (
        <table className="paper-table">
          <thead>
            <tr><th scope="col">{s.tag}</th><th scope="col">{s.item}</th><th scope="col">{s.serial}</th><th scope="col">{s.given}</th><th scope="col">{s.receipt}</th></tr>
          </thead>
          <tbody>
            {sheet.kept.map(l => (
              <tr key={l.item.id}>
                <td className="mono nowrap">{l.item.tag}</td>
                <td>{l.item.name}</td>
                <td>
                  {l.item.serial && <span className="mono block">{l.item.serial}</span>}
                  {l.fields.map(f => <span key={f.name} className="block small">{format(s.field, { name: fieldName(f, t), value: f.value })}</span>)}
                </td>
                <td>{day(l.givenOn)}</td>
                <td>{l.confirmedAt ? format(s.confirmedOn, { date: formatDate(l.confirmedAt, locale, { day: "numeric", month: "long", year: "numeric" }, zone) }) : s.notConfirmed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="paper-statement">{format(s.statementReturn, { date: day(today) })}</p>
      <Signatures t={s} />
    </SheetPage>
  );
}
