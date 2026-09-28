// The tool's mark: a stopwatch — an ink-green dial, a lime hand at a
// quarter past — drawn inline where the page needs it (the header). The
// Chest's tile uses chest/icon.svg, the same drawing.
export function Mark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" className="mark">
      <rect x="19" y="3" width="10" height="5" rx="1.5" fill="var(--mark-ring)" />
      <circle cx="24" cy="27" r="18" fill="var(--mark-dial)" stroke="var(--mark-ring)" strokeWidth="3" />
      <path d="M24 13v3M38 27h-3M24 41v-3M10 27h3" stroke="var(--mark-tick)" strokeWidth="2.5" strokeLinecap="square" />
      <path d="M24 27V17.5M24 27h8" stroke="var(--signal)" strokeWidth="4" strokeLinecap="square" />
      <circle cx="24" cy="27" r="3" fill="var(--signal)" />
    </svg>
  );
}
