// The Expenses mark, drawn inline in the header: a till receipt with a torn
// edge on a green tile — the total underlined. The Chest's tile uses
// chest/icon.svg, the same drawing.
export function Mark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="44" height="44" rx="11" fill="#0b7a43" />
      <path d="M13 8h22v31l-3.67-3-3.67 3-3.66-3-3.67 3-3.66-3L13 39z" fill="#fffdf7" />
      <path d="M18 15h12M18 20h8" stroke="#1a1a17" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M18 25.5h12" stroke="#1a1a17" strokeWidth="1.6" strokeDasharray="2 2" />
      <path d="M18 30.5h12" stroke="#0b7a43" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}
