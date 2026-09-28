// The tool's mark, drawn inline where the page needs it (the header). The
// Chest's tile uses chest/icon.svg, the same drawing.
export function Mark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect x="4" y="4" width="40" height="40" rx="12" fill="var(--accent)" />
      <path d="M15 17h18M15 24h18M15 31h11" stroke="var(--accent-ink)" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}
