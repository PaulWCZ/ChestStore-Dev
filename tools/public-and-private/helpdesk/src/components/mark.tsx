// The Support mark: two speech bubbles, the customer's (coral: the
// categorical slot 3's soft ground) answered by the team's, on the
// accent. Drawn with the look's tokens, so it follows any theme. The
// Chest's tile uses chest/icon.svg, the same drawing in the identity's
// colours.
export function Mark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect width="48" height="48" rx="14" fill="var(--accent)" />
      <path d="M9 12.5a4 4 0 014-4h13a4 4 0 014 4v7a4 4 0 01-4 4h-8.5l-5.5 4.5v-4.5a4 4 0 01-3-3.9z" fill="var(--cat-3-soft)" />
      <path d="M39 24.5a4 4 0 00-4-4H22a4 4 0 00-4 4v7a4 4 0 004 4h8.5l5.5 4.5v-4.5a4 4 0 003-3.9z" fill="var(--accent-ink)" />
      <path d="M24 28.5h10" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
