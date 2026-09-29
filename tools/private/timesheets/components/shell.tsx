"use client";

import { AppShell, type AppShellProps, type LinkComponent } from "@argentic/chest-ui/components";
import Link from "next/link";
import { usePathname } from "next/navigation";

// The kit's shell (skip link, header, labelled tabs — in a row of their own
// on a phone — and the member chip), with Next.js's links and the current
// path, which only the browser side knows here.
const NextLink: LinkComponent = props => <Link {...props} />;

export function Shell(props: Omit<AppShellProps, "path" | "link">) {
  const path = usePathname();
  return <AppShell {...props} path={path} link={NextLink} />;
}
