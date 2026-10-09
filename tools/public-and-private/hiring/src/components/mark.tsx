// The Hiring mark: an open doorway, someone stepping in — the accent's
// door, the page's paper, the tomato of the identity (categorical slot 3).
// Drawn with the look's tokens, so it follows any theme. The Chest's tile
// uses chest/icon.svg, the same drawing in the identity's colours.
export function Mark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect width="48" height="48" rx="13" fill="var(--accent)" />
      <path d="M14 40V20a10 10 0 0120 0v20z" fill="var(--accent-ink)" />
      <circle cx="24" cy="23.5" r="4.6" fill="var(--cat-3)" />
      <path d="M16.5 40a7.5 7.5 0 0115 0z" fill="var(--cat-3)" />
    </svg>
  );
}
