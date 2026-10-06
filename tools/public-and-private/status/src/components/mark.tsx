// The tool's mark: a dark control panel with a history bar — three days
// fine, one day amber. Drawn inline in the private part's header; the
// Chest's tile uses chest/icon.svg, the same drawing.
export function Mark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" className="mark">
      <rect x="3" y="3" width="42" height="42" rx="11" fill="#0f1419" stroke="#3a4552" strokeWidth="1.5" />
      <rect x="10.25" y="13" width="5" height="22" rx="1.5" fill="#3fbf8a" />
      <rect x="17.75" y="13" width="5" height="22" rx="1.5" fill="#3fbf8a" />
      <rect x="25.25" y="13" width="5" height="22" rx="1.5" fill="#e0b33a" />
      <rect x="32.75" y="13" width="5" height="22" rx="1.5" fill="#3fbf8a" />
    </svg>
  );
}
