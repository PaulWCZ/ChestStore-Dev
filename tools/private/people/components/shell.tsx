"use client";

import { AppShell, MemberChip, type LinkComponent, type NavItem } from "@argentic/chest-ui/components";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// The members' part in the kit's shell: the sections as labelled tabs (in
// the header on a wide screen, a row of their own under it on a phone —
// never icons alone), the member chip at the right, a link to one's own
// profile. Here only because the current path and Next's <Link> are
// functions of the browser (ui/README.md "AppShell").

const link: LinkComponent = props => <Link {...props} />;

export function Shell({ brand, nav, member, me, labels, children }: {
  brand: ReactNode;
  nav: NavItem[];
  // href: their own profile (none for a role that gives nothing).
  member: { name: string; role: string | null; photo: string | null; href: string } | null;
  me: string;
  labels: { skip: string; nav: string };
  children: ReactNode;
}) {
  const path = usePathname();
  const chip = member && (member.href ? (
    <Link className="me" href={member.href} aria-current={path === member.href ? "page" : undefined}>
      <MemberChip name={member.name} role={member.role} photo={member.photo} />
      <span className="ck-vh">{me}</span>
    </Link>
  ) : <MemberChip name={member.name} role={member.role} photo={member.photo} />);
  return (
    <AppShell brand={brand} nav={nav} path={path} link={link} tools={chip} labels={labels} width="full">
      {children}
    </AppShell>
  );
}
