import { NavLink } from "../../../../../components/nav-link.tsx";

// The Answers tab's two views: the answers themselves, and their summary.
export function AnswersSwitch({ base, list, summary, label }: { base: string; list: string; summary: string; label: string }) {
  return (
    <nav className="segmented view-switch" aria-label={label}>
      <NavLink href={`${base}/answers`} exact>{list}</NavLink>
      <NavLink href={`${base}/summary`} exact>{summary}</NavLink>
    </nav>
  );
}
