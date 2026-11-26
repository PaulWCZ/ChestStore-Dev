// The tool's mark: a pipeline narrowing to a win — three bars in an
// electric blue square, the last one ending on a green dot. Drawn inline
// in the header; the Chest's tile uses chest/icon.svg, the same drawing.
export function Mark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="44" height="44" rx="10" fill="#2152ff" />
      <rect x="11" y="12" width="26" height="5" rx="1.5" fill="#ffffff" />
      <rect x="11" y="21.5" width="18" height="5" rx="1.5" fill="#ffffff" fillOpacity="0.82" />
      <rect x="11" y="31" width="10" height="5" rx="1.5" fill="#ffffff" fillOpacity="0.64" />
      <circle cx="31" cy="33.5" r="4" fill="#34d27b" />
    </svg>
  );
}
