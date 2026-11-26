// The Rooms mark, drawn inline in the header: a floor plan in white ink on
// a navy blueprint tile, and an orange dot — you, at your place. The
// Chest's tile uses chest/icon.svg, the same drawing.
export function Mark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="44" height="44" rx="10" fill="#0f2447" />
      <path d="M2 17h44M2 31h44M17 2v44M31 2v44" stroke="#2b4d80" strokeWidth="1" />
      <path d="M11 11h26v26H11z" fill="none" stroke="#f3f7fc" strokeWidth="3" strokeLinejoin="round" />
      <path d="M24 11v9M11 24h6M24 28v9" stroke="#f3f7fc" strokeWidth="3" strokeLinecap="round" />
      <circle cx="31" cy="31" r="4.5" fill="#ff7a3d" />
    </svg>
  );
}
