import type { ReactNode } from "react";
import { NavLink } from "../../../components/nav-link.tsx";
import { can } from "../../../lib/access.ts";
import { viewer } from "../../../lib/session.ts";

// The admins' part: offices, rules, export. Others see why they cannot.
export default async function PlacesLayout({ children }: { children: ReactNode }) {
  const v = await viewer();
  if (!v) return null;
  const { member, t } = v;
  if (!can(member, "places.manage")) {
    return (
      <main className="narrow">
        <div className="empty">
          <h1>{t.places.title}</h1>
          <p>{t.errors.forbidden}</p>
        </div>
      </main>
    );
  }
  return (
    <main className="narrow places">
      <div className="page-head">
        <h1>{t.places.title}</h1>
      </div>
      <nav className="subtabs" aria-label={t.places.title}>
        <NavLink href="/chest/places" exact>{t.places.tabs.places}</NavLink>
        <NavLink href="/chest/places/rules">{t.places.tabs.rules}</NavLink>
        <NavLink href="/chest/places/export">{t.places.tabs.export}</NavLink>
      </nav>
      {children}
    </main>
  );
}
