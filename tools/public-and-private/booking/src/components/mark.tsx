// Booking's mark: an appointment card with a tick where the time is free —
// the plum card, paper band and mint tick in its own look, and the colours
// of whatever look the company chose (app/globals.css, "The mark").
// Decorative next to its name.
export function Mark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect className="mark-card" x="3" y="5" width="26" height="24" rx="6" />
      <path className="mark-band" d="M3 12h26" strokeWidth="2" />
      <rect className="mark-pin" x="9" y="2.5" width="3" height="6" rx="1.5" />
      <rect className="mark-pin" x="20" y="2.5" width="3" height="6" rx="1.5" />
      <circle className="mark-free" cx="16" cy="20.5" r="5.5" />
      <path className="mark-tick" d="M13.5 20.6l1.8 1.8 3.3-3.4" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
