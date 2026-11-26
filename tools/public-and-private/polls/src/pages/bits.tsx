// Small pieces the pages share.

// percentClass: a bar's or a column's length from data, as a class
// (pct-0 … pct-100, src/styles.css): the policy refuses style="", so a
// length is never written in the page.
export const percentClass = (value: number): string => `pct-${Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)))}`;
