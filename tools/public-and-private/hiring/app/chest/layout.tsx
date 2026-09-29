import { BrandMark, NoAccess } from "@argentic/chest-ui/components";
import type { ReactNode } from "react";
import { Briefcase, Chart, Gear, Star } from "../../components/icons.tsx";
import { Mark } from "../../components/mark.tsx";
import { TeamShell } from "../../components/team-shell.tsx";
import { can, roleOf } from "../../lib/access.ts";
import { db } from "../../lib/db.ts";
import * as outbox from "../../lib/outbox.ts";
import { viewer } from "../../lib/session.ts";
import { currentLook } from "../../lib/theme.ts";

export const metadata = { robots: { index: false, follow: false } };

// The team's part: the jobs, the talent pool, the reports, the careers
// page's settings, a search, who you are — in the kit's shell
// (components/team-shell.tsx). proxy.ts refused anyone the Chest did not
// sign in; a member whose role gives nothing sees why, not an error.
export default async function TeamLayout({ children }: { children: ReactNode }) {
  const [v, look] = await Promise.all([viewer(), currentLook()]);
  if (!v) return null;
  const { member, t } = v;
  const role = roleOf(member);
  // The tool has no background process: each team page (and its
  // 30-second refresh) sends the emails that are due and the interviews
  // waiting for the calendars (lib/outbox.ts).
  if (role) await outbox.flush(db()).catch(error => console.error("outbox", error instanceof Error ? error.name : "error"));
  const recruiter = can(member, "settings");
  const nav = [
    { href: "/chest", label: t.shell.jobs, icon: <Briefcase />, exact: true },
    ...(recruiter ? [
      { href: "/chest/pool", label: t.shell.pool, icon: <Star /> },
      { href: "/chest/reports", label: t.shell.reports, icon: <Chart /> },
      { href: "/chest/settings", label: t.shell.settings, icon: <Gear /> },
    ] : []),
  ];
  return (
    <TeamShell
      brand={<a href="/chest"><BrandMark logo={look.logo}><Mark /></BrandMark><span className="brand-name">{t.meta.name}</span></a>}
      nav={role ? nav : []}
      member={{ name: member.name, role: role ? t.roles[role] : null, photo: member.photo }}
      search={role ? { label: t.search.label, placeholder: t.search.placeholder, shortcut: t.search.shortcut, submit: t.search.go } : null}
      labels={{ skip: t.shell.skip, nav: t.shell.nav }}
      toast={t.toast}
    >
      {role ? children : <NoAccess labels={{ noAccessTitle: t.noAccess.title, noAccessBody: t.noAccess.body }} />}
    </TeamShell>
  );
}
