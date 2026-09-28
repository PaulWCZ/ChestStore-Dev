// Booking's mark: a plum appointment card with a mint tick, the tool's
// colours. Decorative next to its name.
export function Mark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="3" y="5" width="26" height="24" rx="6" fill="#5b2a86" />
      <path d="M3 12h26" stroke="#fbf7f1" strokeWidth="2" />
      <rect x="9" y="2.5" width="3" height="6" rx="1.5" fill="#24172e" />
      <rect x="20" y="2.5" width="3" height="6" rx="1.5" fill="#24172e" />
      <circle cx="16" cy="20.5" r="5.5" fill="#7fdcbc" />
      <path d="M13.5 20.6l1.8 1.8 3.3-3.4" stroke="#24172e" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
