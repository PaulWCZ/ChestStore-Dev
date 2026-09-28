// WCAG 2 contrast ratio of colour pairs: node scripts/contrast.mjs "#1c1b18 on #ffffff" …
// AA asks 4.5:1 for text, 3:1 for large text and interface parts.
const channel = c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function luminance(hex) {
  const v = hex.replace("#", "");
  const full = v.length === 3 ? [...v].map(x => x + x).join("") : v;
  const [r, g, b] = [0, 2, 4].map(i => channel(parseInt(full.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
if (process.argv[1]?.endsWith("contrast.mjs")) {
  for (const pair of process.argv.slice(2)) {
    const [fg, bg] = pair.split(/\s+on\s+/u);
    const r = ratio(fg, bg);
    console.log(`${pair}: ${r.toFixed(2)}:1 ${r >= 4.5 ? "AA" : r >= 3 ? "AA large only" : "FAIL"}`);
  }
}
