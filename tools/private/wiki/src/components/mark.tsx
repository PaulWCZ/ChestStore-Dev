// The Wiki mark, drawn inline in the header: an open book with a ribbon,
// on a deep green square. The Chest's tile uses chest/icon.svg, the same
// drawing.
export function Mark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="42" height="42" rx="11" fill="#1d5b43" />
      <path d="M24 16.5c-3.6-2.6-8.4-3.3-13-2.6v19.4c4.6-.7 9.4 0 13 2.6 3.6-2.6 8.4-3.3 13-2.6V13.9c-4.6-.7-9.4 0-13 2.6z" fill="#faf6ee" />
      <path d="M24 16.5v19.4" stroke="#1d5b43" strokeWidth="1.6" />
      <path d="M29.5 14.1v8.6l2.4-1.8 2.4 1.8v-9" fill="#e2a83c" />
    </svg>
  );
}
