import { onLinkClick } from "@argentic/chest-app/client";
import type { ReactNode } from "react";

// A link to the same page with other parameters (another day, the plan or
// the list, a filter): it opens in place and keeps the scroll and the
// focus where they are (the package's navigation, { top: false }), as a
// choice made in the page should. The kit's components take it as their
// `link`.
export function StayLink(props: { href: string; className?: string; children: ReactNode; [attribute: string]: unknown }) {
  return <a {...props} onClick={event => onLinkClick(event, { top: false })} />;
}
