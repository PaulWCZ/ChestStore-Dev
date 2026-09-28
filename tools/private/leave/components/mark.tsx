// The tool's mark, drawn inline where the page needs it (the header): a sun
// setting over a calm sea. The Chest's tile uses chest/icon.svg, the same
// drawing.
export function Mark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="42" height="42" rx="13" fill="#d9ecfb" />
      <circle cx="24" cy="24" r="9" fill="#ff9e6e" />
      <path d="M3 31c4 0 6-3 10.5-3s6.5 3 10.5 3 6.5-3 10.5-3 6.5 3 10.5 3v1a13 13 0 0 1-13 13H16A13 13 0 0 1 3 32z" fill="#2366a8" />
      <path d="M12 38.5c2.5 0 3.5-1.5 6-1.5s3.5 1.5 6 1.5 3.5-1.5 6-1.5 3.5 1.5 6 1.5" fill="none" stroke="#bfe0fa" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
