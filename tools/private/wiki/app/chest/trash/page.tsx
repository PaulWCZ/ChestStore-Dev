import { EmptyState } from "@argentic/chest-ui/components";
import { db } from "../../../lib/db.ts";
import { format, plural, relative } from "../../../lib/i18n/index.ts";
import { trash } from "../../../lib/pages.ts";
import { viewer } from "../../../lib/session.ts";
import { TrashRow } from "./trash-row.tsx";

// The trash: deleted pages (with the pages inside them) wait here, to be
// restored or deleted for good — the only step that cannot be undone.
export default async function TrashPage() {
  const v = await viewer();
  if (!v) return null;
  const { member, locale, t } = v;
  const list = await trash(db(), member);
  const now = new Date();
  return (
    <div className="page narrow">
      <h1>{t.trash.title}</h1>
      <p className="lead">{t.trash.lead}</p>
      {list.length === 0 ? <div className="trash-empty"><EmptyState title={t.trash.empty} body={t.trash.emptyBody} /></div> : (
        <ul className="trash">
          {list.map(p => (
            <TrashRow key={p.id} id={p.id} title={p.title}
              detail={[p.spaceName, format(t.trash.deleted, { when: relative(p.deletedAt, locale, now) }), p.below > 0 ? plural(t.trash.below, p.below, locale) : ""].filter(Boolean).join(" · ")}
              t={{ trash: t.trash, common: t.common, errors: t.errors }} />
          ))}
        </ul>
      )}
    </div>
  );
}
