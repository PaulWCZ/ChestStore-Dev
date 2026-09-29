// The Tasks mark, drawn inline in the header: a card with a tick on a sun
// square, with an ink outline and a hard shadow. Drawn in the look's
// tokens (the accent and the ink measured on it), so it follows any theme;
// the Chest's tile uses chest/icon.svg, the same drawing in Workshop's
// colours.
export function Mark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect x="7" y="7" width="37" height="37" rx="10" fill="var(--accent-ink)" />
      <rect x="4" y="4" width="37" height="37" rx="10" fill="var(--accent)" stroke="var(--accent-ink)" strokeWidth="3" />
      <rect x="11" y="12" width="23" height="21" rx="4" fill="none" stroke="var(--accent-ink)" strokeWidth="3" />
      <path d="M16.5 22.5l4 4 7.5-8" fill="none" stroke="var(--accent-ink)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
