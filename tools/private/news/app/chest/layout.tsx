import type { ReactNode } from "react";
import { Avatar } from "../../components/avatar.tsx";
import { Search } from "../../components/icons.tsx";
import { Mark } from "../../components/mark.tsx";
import { Toasts } from "../../components/toast.tsx";
import { WriteButton } from "../../components/write-button.tsx";
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
        {role && (
          <form className="search" role="search" action="/chest/search" method="get">
            <label htmlFor="top-search" className="visually-hidden">{t.search.label}</label>
            <input id="top-search" name="q" type="search" className="field" placeholder={t.shell.search} maxLength={200} />
            <button type="submit" className="icon-button"><Search /><span className="visually-hidden">{t.search.button}</span></button>
          </form>
        )}
        {can(member, "publish") && <WriteButton label={t.shell.write} />}
        <span className="me">
          <span className="who">{member.firstName || member.name}{role ? " · " + t.roles[role] : ""}</span>
          <Avatar name={member.name} photo={member.photo} />
        </span>
      </header>
      <div id="main">
        {role ? children : (
          <main className="narrow">
            <div className="empty">
              <h1>{t.noAccess.title}</h1>
              <p>{t.noAccess.body}</p>
            </div>
          </main>
        )}
      </div>
    </Toasts>
  );
}
