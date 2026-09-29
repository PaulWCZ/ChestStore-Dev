// The tool's mark, drawn inline where the page needs it (the header). The
// Chest's tile uses chest/icon.svg, the same drawing: a folded sheet with
// its ruled lines, sealed in oxblood.
export function Mark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="44" height="44" rx="11" fill="var(--ink)" />
      <path d="M13 9h16l7 7v23H13z" fill="var(--surface)" />
      <path d="M29 9v7h7" fill="none" stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round" opacity=".35" />
      <path d="M17.5 20h13M17.5 25h13M17.5 30h7" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" opacity=".55" />
      <circle cx="31.5" cy="34.5" r="6.5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="1.5" />
      <path d="M28.8 34.6l1.9 1.9 3.6-3.8" fill="none" stroke="var(--accent-ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
