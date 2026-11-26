import { Island, type MemberContext, type PageContext, type View } from "@argentic/chest-app";
import { EmptyState } from "@argentic/chest-ui/components";
import { format, localeOf, plural, relative } from "../i18n/index.ts";
import { db } from "../lib/db.ts";
import { trash } from "../lib/pages.ts";

// The trash: deleted pages (with the pages inside them) wait here, to be
// restored or deleted for good — the only step that cannot be undone.
export async function trashPage({ member, locale: language, t }: PageContext<MemberContext>): Promise<View> {
  const locale = localeOf(language);
  const list = await trash(db(), member);
  const now = new Date();
  return { title: t.trash.title, body: (
    <div className="page narrow">
      <h1>{t.trash.title}</h1>
      <p className="lead">{t.trash.lead}</p>
      {list.length === 0 ? <div className="trash-empty"><EmptyState title={t.trash.empty} body={t.trash.emptyBody} /></div> : (
        <ul className="trash">
          {list.map(p => (
            <Island key={p.id} id={`trash-${p.id}`} name="TrashRow" props={{ id: p.id, title: p.title, detail: [p.spaceName, format(t.trash.deleted, { when: relative(p.deletedAt, locale, now) }), p.below > 0 ? plural(t.trash.below, p.below, locale) : ""].filter(Boolean).join(" · "), t: { trash: t.trash, common: t.common } }} />
          ))}
        </ul>
      )}
    </div>
  ) };
}
