// The tool's mark: an asset tag on a steel plate. Drawn in the look's
// tokens (the steel of the bar, the tag's orange and the text measured on
// it), so it follows any theme; the Chest's tile uses chest/icon.svg, the
// same drawing in the tool crib's own colours.
export function Mark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" className="mark">
      <rect x="4" y="4" width="40" height="40" rx="10" fill="var(--steel)" />
      <path d="M10 15.5h20.5l7.5 8.5-7.5 8.5H10z" fill="var(--tag)" />
      <circle cx="31" cy="24" r="2.6" fill="var(--steel)" />
      <path d="M14.5 20.5h9M14.5 24h6M14.5 27.5h9" stroke="var(--tag-ink)" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}
