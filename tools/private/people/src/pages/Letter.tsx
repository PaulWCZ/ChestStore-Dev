import { Island, type PageContext, type View } from "@argentic/chest-app";
import { format } from "../i18n/index.ts";
import { db } from "../lib/db.ts";
import { printLetter } from "../lib/letters.ts";
import { today } from "../lib/zone.ts";
import { BackLink } from "./parts.tsx";

// One letter filled from one record (HR only), laid out as paper: printed
// or saved as PDF by the browser. What the record does not say is named
// above it (not printed) and left blank in it.
export async function letterPage({ member, t, param }: PageContext): Promise<View> {
  const done = await printLetter(db(), member, param("id"), param("letter"), today());
  return {
    title: done.title,
    body: (
      <div className="page narrow letter-page">
        <BackLink href={`/chest/records/${done.recordId}`} className="no-print">{t.letters.back}</BackLink>
        <div className="row no-print letter-actions">
          <h1 className="visually-hidden">{done.title}</h1>
          <Island name="PrintButton" props={{ label: t.letters.print }} />
        </div>
        {done.missing.length > 0 && <p className="banner warn no-print" role="status">{format(t.letters.missing, { list: done.missing.map(f => t.letters.fields[f]).join(", ") })}</p>}
        <p className="hint no-print">{t.letters.sign}</p>
        <article className="letter-sheet">{done.text}</article>
      </div>
    ),
  };
}
