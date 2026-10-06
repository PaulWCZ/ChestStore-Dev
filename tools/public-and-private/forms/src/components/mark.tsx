// The tool's mark: a berry card with a folded corner and two answers, one
// chosen. Drawn inline in the header; chest/icon.svg and app/icon.svg are
// the same drawing.
export function Mark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" className="mark">
      <path d="M12 4h18l14 14v18a8 8 0 0 1-8 8H12a8 8 0 0 1-8-8V12a8 8 0 0 1 8-8Z" fill="var(--accent)" />
      <path d="M30 4v8a6 6 0 0 0 6 6h8Z" fill="var(--accent-soft)" />
      <circle cx="15.5" cy="24" r="4" fill="none" stroke="var(--accent-ink)" strokeWidth="2.6" />
      <path d="M24 24h10" stroke="var(--accent-ink)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="15.5" cy="34.5" r="4.6" fill="var(--marigold)" />
      <path d="M24 34.5h8" stroke="var(--accent-ink)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
