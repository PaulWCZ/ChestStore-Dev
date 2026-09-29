import Link from "next/link";
import { MapEmpty } from "../../components/map-empty.tsx";
import { catalogue } from "../../lib/i18n/index.ts";
import { pageLocale } from "../../lib/session.ts";

// Something of /chest that does not exist (or no longer does), inside the
// tool's frame.
export default async function NotFound() {
  const t = catalogue(await pageLocale());
  return (
    <div className="narrow">
      <MapEmpty headingLevel={1} title={t.notFound.title} body={t.notFound.body} action={<Link className="button quiet" href="/chest">{t.notFound.back}</Link>} />
    </div>
  );
}
