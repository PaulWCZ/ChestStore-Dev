import { Island, type LayoutProps, type MemberContext, type VisitorContext } from "@argentic/chest-app";
import { AppShell, BrandMark, NoAccess, type NavItem } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { Calendar, Clock, Gear, Stack } from "./components/icons.tsx";
import { Mark } from "./components/mark.tsx";
import { can, roleOf } from "./lib/access.ts";
import { lookNow } from "./theme.ts";

// What goes around every page. The members' part: the kit's shell (skip
// link, header, labelled sections — on a phone in a row of their own —,
// the member chip); in brand mode the company's logo stands where the
// tool's mark is. A member whose role gives nothing sees why, not an
// error. The public part: each page draws its own top — the company and
// the language switch (src/pages/PublicShell.tsx) — as its words differ.
// Both: the toasts, outside the page's main region, under an id: a page
// met by navigate() (@argentic/chest-app/client) keeps them ("Type saved", then
// the list of types); and the refusal of a form sent without JavaScript
// (notice).

type Section = "bookings" | "types" | "hours" | "settings";
const icons: Record<Section, () => ReactNode> = { bookings: Calendar, types: Stack, hours: Clock, settings: Gear };
const hrefs: Record<Section, string> = { bookings: "/chest", types: "/chest/types", hours: "/chest/hours", settings: "/chest/settings" };

export function MembersLayout({ viewer: { member, t }, path, notice, children }: LayoutProps<MemberContext>) {
  const look = lookNow("team");
  const role = roleOf(member);
  const hosts = can(member, "host");
  const sections: Section[] = !role ? [] : ["bookings", ...(hosts ? ["types", "hours"] as const : []), "settings"];
  const nav: NavItem[] = sections.map(s => ({ href: hrefs[s], label: t.shell[s], icon: icons[s]() }));
  // "Bookings" is also the current section on a booking's page and on
  // "New booking" (the kit marks /chest current on /chest alone).
  const shown = path.startsWith("/chest/bookings/") || path === "/chest/new" ? "/chest" : path;
  return (
    <>
      <AppShell
        brand={<a href="/chest"><BrandMark logo={look.logo}><Mark /></BrandMark>{t.tool.name}</a>}
        nav={nav}
        path={shown}
        member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo }}
        labels={{ skip: t.shell.skip, nav: t.shell.nav }}
      >
        {notice && <p className="notice spaced" role="alert">{notice}</p>}
        {role ? children : <NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} />}
      </AppShell>
      <Island id="toasts" name="ToastHost" props={{ labels: t.kit.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy } }} />
    </>
  );
}

export function PublicLayout({ viewer: { t }, notice, children }: LayoutProps<VisitorContext>) {
  return (
    <>
      <a className="ck-skip" href="#main">{t.shell.skip}</a>
      {notice && <p className="notice spaced" role="alert">{notice}</p>}
      {children}
      <Island id="toasts" name="ToastHost" props={{ labels: t.kit.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy } }} />
    </>
  );
}
