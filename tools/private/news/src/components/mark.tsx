// The tool's mark: a front page — the red nameplate, lines of text and a
// photo. Drawn inline in the header with the page's colours (so it follows
// dark mode); the Chest's tile uses chest/icon.svg, the same drawing.
export function Mark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" className="mark">
      <rect x="5" y="5" width="38" height="38" rx="5" fill="var(--surface)" stroke="var(--ink)" strokeWidth="3" />
      <rect x="11" y="11" width="26" height="8" fill="var(--accent)" />
      <path d="M11 25h26M11 31h11M11 37h11" stroke="var(--ink)" strokeWidth="3" fill="none" />
      <rect x="26" y="29" width="11" height="9" fill="var(--ink)" />
    </svg>
  );
}
