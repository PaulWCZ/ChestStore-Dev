import { Island, type LayoutProps, type MemberContext, type VisitorContext } from "@argentic/chest-app";
import { AppShell, BrandMark, type NavItem } from "@argentic/chest-ui/components";
import { Clock, External, Gear, Pulse, Radar, Stack } from "./components/icons.tsx";
import { Mark } from "./components/mark.tsx";
import { roleOf } from "./lib/access.ts";
import { publicOrigin } from "./lib/public-origin.ts";
import { sourceOf } from "./lib/theme.ts";

// What goes around every page.
//
// The team's part: the kit's AppShell (skip link, header, labelled
// sections — a row of their own under the header on a phone, never icons
// alone —, the member chip). Five sections: an incident or a maintenance
// is part of "Now" (where it is posted from), the subscribers of
// "Settings" (where the page is set up). At the right, the public page,
// as customers see it, in a new tab — fresh, not a copy the browser kept.
// A member without a role sees the team's status page (read only: each
// page of src/app.tsx renders it for them) and no sections. In brand mode
// the company's logo stands where the Status mark does. `data-look` keeps
// the identity's own touches (the dark control panel of the header) for
// the identity only.
//
// The toasts sit outside the page's main region, under an id: a page met
// by navigate() keeps them, and a toast's Undo with them ("Incident
// removed", then Now). A refusal of a form sent without JavaScript comes
// back as `notice`. Only the words of t.tool, t.pages, t.kit and the
// shell's here.
export function MembersLayout({ viewer: { member, t, request }, look, path, notice, children }: LayoutProps<MemberContext>) {
  const role = roleOf(member);
  const nav: NavItem[] = role ? [
    { href: "/chest", label: t.shell.now, icon: <Pulse />, also: ["/chest/incidents", "/chest/maintenance"] },
    { href: "/chest/history", label: t.shell.history, icon: <Clock /> },
    { href: "/chest/components", label: t.shell.components, icon: <Stack /> },
    { href: "/chest/checks", label: t.shell.checks, icon: <Radar /> },
    { href: "/chest/settings", label: t.shell.settings, icon: <Gear />, also: ["/chest/subscribers"] },
  ] : [];
  const publicHome = `${publicOrigin(request.headers) ?? ""}/?fresh=${Math.floor(Date.now() / 1000)}`;
  return (
    <>
      <div className="look" data-look={sourceOf(look) ?? "own"}>
        <AppShell
          brand={<a href="/chest"><BrandMark logo={look?.logo ?? null}><Mark /></BrandMark><span>{t.meta.name}</span></a>}
          nav={nav}
          path={path}
          member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo }}
          tools={role ? <a className="public-link" href={publicHome} target="_blank" rel="noopener">{t.shell.publicPage}<External /></a> : null}
          labels={{ skip: t.shell.skip, nav: t.shell.nav }}
          width="normal"
        >
          {notice && <p className="notice" role="alert">{notice}</p>}
          {children}
        </AppShell>
      </div>
      <Island id="toasts" name="ToastHost" props={{ labels: t.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy } }} />
    </>
  );
}

// The public part: each page draws its own frame — the company's name or
// logo, the language switch, "Get updates", the footer —, as it reads the
// page's settings (src/pages/parts/public-shell.tsx). An error page (a
// link that leads nowhere) is drawn here: what happened, and the way back
// to the status page. The forms there show their own refusals beside
// their fields (?error=…): no notice here.
export function PublicLayout({ viewer: { t }, status, children }: LayoutProps<VisitorContext>) {
  return (
    <>
      {status === 200 ? children : (
        <main id="main" className="wrap public-main narrow not-found" tabIndex={-1}>
          {children}
          <p><a className="button quiet" href="/">{t.notFound.back}</a></p>
        </main>
      )}
      <Island id="toasts" name="ToastHost" props={{ labels: t.toast, words: { unavailable: t.errors.unavailable, busy: t.pages.busy } }} />
    </>
  );
}
