import type { Catalogue } from "../../lib/i18n/index.ts";

// What a page for managers shows to someone else: why, not an error.
export function Forbidden({ t }: { t: Catalogue }) {
  return (
    <main className="page narrow">
      <div className="empty">
        <h1>{t.noAccess.title}</h1>
        <p>{t.errors.forbidden}</p>
        <a className="button quiet" href="/chest">{t.notFound.back}</a>
      </div>
    </main>
  );
}
