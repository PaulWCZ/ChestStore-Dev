// The Expenses mark, drawn inline in the header: a till receipt with a torn
// edge on a tile of the action colour — the total underlined. Drawn in the
// look's tokens (the paper is the surface, its lines the ink), so it
// follows any theme; in the tool's own look it is the Chest's tile,
// chest/icon.svg, the same drawing in Receipt's colours.
export function Mark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="44" height="44" rx="11" fill="var(--accent)" />
      <path d="M13 8h22v31l-3.67-3-3.67 3-3.66-3-3.67 3-3.66-3L13 39z" fill="var(--surface)" />
      <path d="M18 15h12M18 20h8" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M18 25.5h12" stroke="var(--ink)" strokeWidth="1.6" strokeDasharray="2 2" />
      <path d="M18 30.5h12" stroke="var(--accent)" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}
