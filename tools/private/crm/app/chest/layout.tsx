import type { ReactNode } from "react";
import { Avatar } from "../../components/avatar.tsx";
import { Building, Dots, Gear, Person, Pipeline, Search, Today, Upload } from "../../components/icons.tsx";
import { Mark } from "../../components/mark.tsx";
import { NavLink } from "../../components/nav-link.tsx";
import { SlashSearch } from "../../components/slash-search.tsx";
import { Toasts } from "../../components/toast.tsx";
import { can, roleOf } from "../../lib/access.ts";
import { viewer } from "../../lib/session.ts";

// The members' part. proxy.ts already refused a request without the Chest's
// assertion; a member whose role gives nothing sees why, not an error. On a
// phone, the sections move to a bar under the thumb.
export default async function MembersLayout({ children }: { children: ReactNode }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  const sections = [
    { href: "/chest", exact: true, icon: <Today />, label: t.shell.myDay },
    { href: "/chest/deals", exact: false, icon: <Pipeline />, label: t.shell.deals },
    { href: "/chest/companies", exact: false, icon: <Building />, label: t.shell.companies },
    { href: "/chest/contacts", exact: false, icon: <Person />, label: t.shell.contacts },
  ];
  return (
    <Toasts>
      <a className="skip" href="#main">{t.shell.skip}</a>
      <header className="top">
        <a className="brand" href="/chest"><Mark /><span>{t.meta.name}</span></a>
        {role && (
          <nav className="tabs" aria-label={t.shell.nav}>
            {sections.map(s => <NavLink key={s.href} href={s.href} exact={s.exact}>{s.icon}<span>{s.label}</span></NavLink>)}
          </nav>
        )}
        {role && (
          <form className="search" action="/chest/search" role="search">
            <Search />
            <label htmlFor="q" className="visually-hidden">{t.shell.search}</label>
            <input id="q" name="q" type="search" placeholder={t.shell.searchPlaceholder} maxLength={100} autoComplete="off" />
            <kbd className="kbd" title={t.shell.searchKey}>/</kbd>
          </form>
        )}
        {role && <a className="icon-button search-link" href="/chest/search" title={t.shell.search}><Search /><span className="visually-hidden">{t.shell.search}</span></a>}
        {role && (can(member, "import") || can(member, "stages")) && (
          <details className="menu">
            <summary className="icon-button" title={t.shell.more}><Dots /><span className="visually-hidden">{t.shell.more}</span></summary>
            <div className="menu-pop">
              {can(member, "import") && <a href="/chest/import"><Upload />{t.shell.import}</a>}
              {can(member, "stages") && <a href="/chest/settings"><Gear />{t.shell.stages}</a>}
            </div>
          </details>
        )}
        <span className="me">
          <span className="who"><span className="who-name">{member.firstName || member.name}</span>{role && <span className="who-role">{t.roles[role]}</span>}</span>
          <Avatar name={member.name} photo={member.photo} size={30} />
        </span>
      </header>
      {role && <SlashSearch />}
      <div id="main">
        {role ? children : (
          <main className="page narrow">
            <div className="empty">
              <h1>{t.noAccess.title}</h1>
              <p>{t.noAccess.body}</p>
            </div>
          </main>
        )}
      </div>
      {role && (
        <nav className="bottom-nav" aria-label={t.shell.nav}>
          {sections.map(s => <NavLink key={s.href} href={s.href} exact={s.exact}>{s.icon}<span>{s.label}</span></NavLink>)}
        </nav>
      )}
    </Toasts>
  );
}
