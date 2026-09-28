// The Tasks mark, drawn inline in the header: a card with a tick, on a sun
// square with an ink outline and a hard shadow. The Chest's tile uses
// chest/icon.svg, the same drawing.
export function Mark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect x="7" y="7" width="37" height="37" rx="10" fill="#151515" />
      <rect x="4" y="4" width="37" height="37" rx="10" fill="#ffd84d" stroke="#151515" strokeWidth="3" />
      <rect x="11" y="12" width="23" height="21" rx="4" fill="#fff" stroke="#151515" strokeWidth="3" />
      <path d="M16.5 22.5l4 4 7.5-8" fill="none" stroke="#151515" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
