// The tool's mark: a ballot card with three result bars and confetti,
// drawn inline where the page needs it (the header). The Chest's tile uses
// chest/icon.svg, the same drawing.
export function Mark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect x="3" y="5" width="42" height="40" rx="13" fill="#1b2440" />
      <rect x="3" y="3" width="42" height="40" rx="13" fill="#ff7a63" stroke="#1b2440" strokeWidth="2.5" />
      <rect x="11" y="12" width="24" height="5.5" rx="2.75" fill="#1b2440" />
      <rect x="11" y="20.5" width="17" height="5.5" rx="2.75" fill="#ffffff" />
      <rect x="11" y="29" width="10" height="5.5" rx="2.75" fill="#34d1a0" stroke="#1b2440" strokeWidth="1.5" />
      <circle cx="36.5" cy="23" r="2.6" fill="#ffc940" stroke="#1b2440" strokeWidth="1.5" />
      <circle cx="30.5" cy="33" r="2.1" fill="#ffffff" />
    </svg>
  );
}
