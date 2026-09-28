import Link from "next/link";
import { Contours } from "../../components/contours.tsx";
import { catalogue } from "../../lib/i18n/index.ts";
import { pageLocale } from "../../lib/session.ts";

// Something of /chest that does not exist (or no longer does), inside the
// tool's frame.
export default async function NotFound() {
  const t = catalogue(await pageLocale());
  return (
    <div className="narrow">
      <div className="empty">
        <Contours variant="small" />
        <h1>{t.notFound.title}</h1>
        <p>{t.notFound.body}</p>
        <Link className="button quiet" href="/chest">{t.notFound.back}</Link>
      </div>
    </div>
  );
}
