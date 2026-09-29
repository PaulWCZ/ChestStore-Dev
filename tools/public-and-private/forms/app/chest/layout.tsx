import { NoAccess, Toasts } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { roleOf } from "../../lib/access.ts";
import { viewer } from "../../lib/session.ts";

// The members' part. proxy.ts already refused a request without the Chest's
// assertion; a member whose role gives nothing sees why, not an error. The
// work pages add the kit's shell ((work)/layout.tsx); a team form to answer
// (f/…) is shown as its respondents see it. The kit's toasts (Undo that
// tells the truth) around both.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  if (!roleOf(member)) {
    return (
      <main className="page" id="main">
        <NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} />
      </main>
    );
  }
  return <Toasts labels={t.toast}>{children}</Toasts>;
}
