import type { ReactNode } from "react";
import { canEdit, canRead } from "../../lib/forms.ts";
import { currentMember, words } from "../../lib/session.ts";

// The members' part: the Chest admits the member and asserts who they are
// (proxy.ts refuses a request without that assertion); their role here
// says what they may do.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const actor = await currentMember();
  const t = await words();
  return (
    <div className="page">
      <header className="bar">
        <a className="brand" href="/chest"><i>{t.appName.slice(0, 1)}</i>{t.appName.slice(1)}</a>
        {actor && <span className="who">{actor.name} · {t.members.roles[actor.role ?? ""] ?? t.members.noRole}{canEdit(actor) ? "" : " · " + t.members.readOnly}</span>}
      </header>
      {canRead(actor) ? children : <main><h1>{t.members.limitedTitle}</h1><p>{t.members.limitedBody}</p></main>}
    </div>
  );
}
