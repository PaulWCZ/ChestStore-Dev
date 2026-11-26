// The tool's mark, drawn inline where the page needs it (the header): two
// portraits side by side under an arch. The Chest's tile uses
// chest/icon.svg, the same drawing.
export function Mark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path d="M6 44V22a18 18 0 0136 0v22z" fill="var(--accent)" />
      <circle cx="18" cy="24" r="5" fill="var(--accent-ink)" />
      <circle cx="30" cy="24" r="5" fill="var(--accent-ink)" />
      <path d="M10 44a8 8 0 0116 0M22 44a8 8 0 0116 0" fill="var(--accent-ink)" />
    </svg>
  );
}
