import type { ReactNode } from "react";
import { Toasts } from "../../components/toast.tsx";
import { roleOf } from "../../lib/access.ts";
import { viewer } from "../../lib/session.ts";

// The members' part. proxy.ts already refused a request without the Chest's
// assertion; a member whose role gives nothing sees why, not an error. The
// work pages add the tool's bar ((work)/layout.tsx); a team form to answer
// (f/…) is shown as its respondents see it.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  if (!roleOf(member)) {
    return (
      <main className="page" id="main">
        <div className="empty"><h1>{t.noAccess.title}</h1><p>{t.noAccess.body}</p></div>
      </main>
    );
  }
  return <Toasts>{children}</Toasts>;
}
