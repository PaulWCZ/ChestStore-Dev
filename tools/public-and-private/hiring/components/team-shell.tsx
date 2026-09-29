"use client";

import { AppShell, SearchBox, Toasts, useAutoRefresh, type LinkComponent, type NavItem } from "@argentic/chest-ui/components";
import type { SearchWords, ToastWords } from "@argentic/chest-ui/components/logic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

// The team's frame, in the kit's shell: the sections as labelled tabs (a
// row of their own on a phone), the search, who is signed in, the toasts
// — and the page reading itself again every 30 seconds while it is seen
// (the Chest has no WebSocket; each read also sends the emails that are
// due: app/chest/layout.tsx).
const NextLink: LinkComponent = ({ children, ...props }) => <Link {...props}>{children}</Link>;

// A job's board, a candidate, the mail to file and a search are parts of
// "Jobs": its tab stays current there.
const underJobs = /^\/chest\/(jobs|candidates|mail|search)(\/|$)/u;

export function TeamShell({ brand, nav, member, search, labels, toast, children }: {
  brand: ReactNode;
  nav: NavItem[];
  member: { name: string; role: string | null; photo: string | null };
  search: SearchWords | null;
  labels: { skip: string; nav: string };
  toast: ToastWords;
  children: ReactNode;
}) {
  const router = useRouter();
  const path = usePathname();
  useAutoRefresh(() => router.refresh(), 30);
  return (
    <Toasts labels={toast}>
      <AppShell
        brand={brand}
        nav={nav}
        path={underJobs.test(path) ? "/chest" : path}
        link={NextLink}
        member={member}
        tools={search ? <SearchBox action="/chest/search" labels={search} id="top-q" /> : null}
        labels={labels}
        width="wide"
      >
        {children}
      </AppShell>
    </Toasts>
  );
}
