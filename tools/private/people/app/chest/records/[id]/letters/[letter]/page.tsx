import Link from "next/link";
import { notFound } from "next/navigation";
import { Back } from "../../../../../../components/icons.tsx";
import { AppError } from "../../../../../../lib/app-error.ts";
import { db } from "../../../../../../lib/db.ts";
import { format } from "../../../../../../lib/i18n/index.ts";
import { printLetter } from "../../../../../../lib/letters.ts";
import { viewer } from "../../../../../../lib/session.ts";
import { today } from "../../../../../../lib/zone.ts";
import { PrintButton } from "../../../register/print-button.tsx";

// One letter filled from one record (HR only), laid out as paper: printed
// or saved as PDF by the browser. What the record does not say is named
// above it (not printed) and left blank in it.
export default async function LetterPage({ params }: { params: Promise<{ id: string; letter: string }> }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  const { id, letter } = await params;
  let done: Awaited<ReturnType<typeof printLetter>>;
  try {
    done = await printLetter(db(), member, id, letter, today());
  } catch (error) {
    if (error instanceof AppError) notFound();
    throw error;
  }
  return (
    <div className="page narrow letter-page">
      <Link className="back no-print" href={`/chest/records/${done.recordId}`}><Back />{t.letters.back}</Link>
      <div className="row no-print letter-actions">
        <h1 className="visually-hidden">{done.title}</h1>
        <PrintButton label={t.letters.print} />
      </div>
      {done.missing.length > 0 && <p className="banner warn no-print" role="status">{format(t.letters.missing, { list: done.missing.map(f => t.letters.fields[f]).join(", ") })}</p>}
      <p className="hint no-print">{t.letters.sign}</p>
      <article className="letter-sheet">{done.text}</article>
    </div>
  );
}
