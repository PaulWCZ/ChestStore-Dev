// The tool's mark: a summit with a flag, the sun rising behind it. Drawn
// inline in the header; the Chest's tile uses chest/icon.svg, the same
// drawing.
export function Mark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="44" height="44" rx="12" fill="#f3eee2" />
      <circle cx="31" cy="21" r="8" fill="#bf4f1d" />
      <path d="M6 38l13-20 7 10 4-5 12 15z" fill="#17302a" />
      <path d="M19 18v-9l7 2.5-7 2.5" fill="none" stroke="#17302a" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M15 24.5l4-6.5 3.2 4.6" fill="none" stroke="#f3eee2" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
