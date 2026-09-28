import type { ReactNode } from "react";
import { Avatar } from "../../components/avatar.tsx";
import { Plus } from "../../components/icons.tsx";
import { Mark } from "../../components/mark.tsx";
import { Toasts } from "../../components/toast.tsx";
import { can, roleOf } from "../../lib/access.ts";
import { viewer } from "../../lib/session.ts";

// The members' part. proxy.ts already refused a request without the Chest's
// assertion; a member whose role gives nothing sees why, not an error.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  return (
    <Toasts>
      <a className="skip" href="#main">{t.shell.skip}</a>
      <header className="topbar">
        <a className="brand" href="/chest"><Mark /><span>{t.meta.name}</span></a>
        <span className="me">
          {can(member, "create") && <a className="button primary small" href="/chest/new"><Plus /><span>{t.shell.newPoll}</span></a>}
          <span className="who">{member.firstName || member.name}{role ? " · " + t.roles[role] : ""}</span>
          <Avatar name={member.name} photo={member.photo} />
        </span>
      </header>
      <main id="main" className="page">
        {role ? children : (
          <div className="empty">
            <h1>{t.noAccess.title}</h1>
            <p>{t.noAccess.body}</p>
          </div>
        )}
      </main>
    </Toasts>
  );
}
